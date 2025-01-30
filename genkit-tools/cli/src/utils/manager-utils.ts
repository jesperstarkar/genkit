/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  LocalFileTraceStore,
  startTelemetryServer,
} from '@genkit-ai/telemetry-server';
import { Status } from '@genkit-ai/tools-common';
import {
  GenkitToolsError,
  RuntimeManager,
} from '@genkit-ai/tools-common/manager';
import { findServersDir, logger } from '@genkit-ai/tools-common/utils';
import axios from 'axios';
import * as clc from 'colorette';
import fs from 'fs/promises';
import getPort, { makeRange } from 'get-port';
import path from 'path';

export interface TelemetryInfo {
  /** URL of the telemetry server. */
  url: string;
}

/**
 * Checks if the provided data is a valid telemetry server state file.
 */
export function isValidTelemetryInfo(data: any): data is TelemetryInfo {
  return typeof data === 'object' && typeof data.url === 'string';
}

/**
 * Returns the telemetry server address either based on environment setup or starts one.
 *
 * This function is not idempotent. Typically you want to make sure it's called only once per cli instance.
 */
export async function resolveTelemetryServer(): Promise<string> {
  let telemetryServerUrl = process.env.GENKIT_TELEMETRY_SERVER;
  if (!telemetryServerUrl) {
    telemetryServerUrl = await getOrStartTelemetryServer();
  }
  return telemetryServerUrl;
}

/**
 * Starts the runtime manager and its dependencies.
 */
export async function startManager(
  manageHealth?: boolean
): Promise<RuntimeManager> {
  const telemetryServerUrl = await resolveTelemetryServer();
  const manager = RuntimeManager.create({ telemetryServerUrl, manageHealth });
  return manager;
}

/**
 * Runs the given function with a runtime manager.
 */
export async function runWithManager(
  fn: (manager: RuntimeManager) => Promise<void>
) {
  let manager: RuntimeManager;
  try {
    manager = await startManager(false); // Don't manage health in this case.
  } catch (e) {
    process.exit(1);
  }
  try {
    await fn(manager);
  } catch (err) {
    logger.info('Command exited with an Error:');
    const error = err as GenkitToolsError;
    if (typeof error.data === 'object') {
      const errorStatus = error.data as Status;
      const { code, details, message } = errorStatus;
      logger.info(`\tCode: ${code}`);
      logger.info(`\tMessage: ${message}`);
      logger.info(`\tTrace: http://localhost:4200/traces/${details.traceId}\n`);
    } else {
      logger.info(`\tMessage: ${error.data}\n`);
    }
    logger.error('Stack trace:');
    logger.error(`${error.stack}`);
  }
}

/**
 * Fetches an existing Telemetry Server URL from servers config. Otherwise,
 * creates a new server and updates the server config.
 *
 * @returns telemetry server url
 */
async function getOrStartTelemetryServer(): Promise<string> {
  const serversDir = await findServersDir();
  const telemetryPath = path.join(serversDir, 'telemetry.json');
  try {
    const toolsJsonContent = await fs.readFile(telemetryPath, 'utf-8');
    const serverInfo = JSON.parse(toolsJsonContent) as TelemetryInfo;
    if (isValidTelemetryInfo(serverInfo)) {
      try {
        await axios.get(`${serverInfo.url}/api/__health`);
        logger.info(
          clc.green(
            `\nTelemetry server is already running at: ${serverInfo.url}`
          )
        );
        return serverInfo.url;
      } catch (error) {
        logger.debug(
          'Found Telemetry server metadata but server is not healthy. Starting a new one...'
        );
      }
    }
  } catch (error) {
    logger.debug('No telemetry config found. Starting a new one...');
  }
  return await startNewTelemetryServer();
}

/**
 * Creates a new server and updates the server config.
 *
 * @returns telemetry server url
 */
async function startNewTelemetryServer(): Promise<string> {
  const telemetryPort = await getPort({ port: makeRange(4033, 4999) });
  const telemetryServerUrl = `http://localhost:${telemetryPort}`;
  startTelemetryServer({
    port: telemetryPort,
    traceStore: new LocalFileTraceStore(),
  });

  const serversDir = await findServersDir();
  await fs.mkdir(serversDir, { recursive: true });
  const telemetryPath = path.join(serversDir, 'telemetry.json');
  const telemeryInfo: TelemetryInfo = { url: telemetryServerUrl };
  await fs.writeFile(
    telemetryPath,
    JSON.stringify(telemeryInfo, undefined, '  ')
  );
  logger.debug(`Updated telemetry config at ${telemetryPath}`);
  return telemetryServerUrl;
}
