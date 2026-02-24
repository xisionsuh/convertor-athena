import os from 'os';
import { execSync } from 'child_process';
import { logger } from '../../utils/logger.js';

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  const decimals = index === 0 ? 0 : 2;
  return `${value.toFixed(decimals)} ${units[index]}`;
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];

  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.length > 0 ? parts.join(' ') : '0m';
}

function cpuTotals(cpus = os.cpus()) {
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    const times = cpu.times;
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.irq + times.idle;
  }

  return { idle, total };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getCpuUsagePercent(sampleMs = 200) {
  const first = cpuTotals();
  await sleep(sampleMs);
  const second = cpuTotals();

  const idleDelta = second.idle - first.idle;
  const totalDelta = second.total - first.total;
  if (totalDelta <= 0) return 0;

  return Number((((totalDelta - idleDelta) / totalDelta) * 100).toFixed(1));
}

function parseDfOutput(raw) {
  const lines = raw.trim().split('\n').slice(1);
  return lines
    .filter((line) => line.trim())
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 6) return null;

      return {
        filesystem: parts[0],
        size: parts[1],
        used: parts[2],
        available: parts[3],
        usagePercent: parts[4],
        mountpoint: parts.slice(5).join(' ')
      };
    })
    .filter(Boolean);
}

function getDiskInfo() {
  const output = execSync('df -h', {
    encoding: 'utf-8',
    timeout: 5000,
    stdio: ['ignore', 'pipe', 'ignore']
  });
  return parseDfOutput(output);
}

function getSwapInfo() {
  try {
    const output = execSync('free -b', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const line = output
      .split('\n')
      .find((entry) => entry.trim().toLowerCase().startsWith('swap:'));

    if (!line) {
      return { total: '0 B', used: '0 B', free: '0 B' };
    }

    const parts = line.trim().split(/\s+/);
    const total = Number.parseInt(parts[1], 10) || 0;
    const used = Number.parseInt(parts[2], 10) || 0;
    const free = Number.parseInt(parts[3], 10) || 0;

    return {
      total: formatBytes(total),
      used: formatBytes(used),
      free: formatBytes(free)
    };
  } catch (error) {
    logger.warn('Failed to read swap info', { error: error.message });
    return { total: 'N/A', used: 'N/A', free: 'N/A' };
  }
}

function parseIpAddrOutput(output) {
  const interfaces = {};

  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 4) continue;

    const name = parts[1];
    const family = parts[2];
    const address = parts[3];
    const scope = parts.find((part) => ['global', 'link', 'host'].includes(part)) || null;

    if (!interfaces[name]) {
      interfaces[name] = [];
    }

    interfaces[name].push({ family, address, scope });
  }

  return interfaces;
}

function parseIfconfigOutput(output) {
  const interfaces = {};
  let current = null;

  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    if (!rawLine.startsWith('\t') && !rawLine.startsWith(' ')) {
      const match = rawLine.match(/^([^\s:]+)/);
      if (!match) continue;
      current = match[1];
      interfaces[current] = interfaces[current] || [];
      continue;
    }

    if (!current) continue;

    const inetMatch = line.match(/inet\s(?:addr:)?([0-9.\/]+)/);
    if (inetMatch) {
      interfaces[current].push({ family: 'inet', address: inetMatch[1], scope: 'global' });
    }

    const inet6Match = line.match(/inet6\s(?:addr:)?([0-9a-fA-F:\/]+)/);
    if (inet6Match) {
      interfaces[current].push({ family: 'inet6', address: inet6Match[1], scope: 'global' });
    }
  }

  return interfaces;
}

function getNetworkInfo() {
  try {
    const ipOutput = execSync('ip -o addr show', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    return parseIpAddrOutput(ipOutput);
  } catch (ipError) {
    try {
      const ifconfigOutput = execSync('ifconfig', {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore']
      });
      return parseIfconfigOutput(ifconfigOutput);
    } catch (ifconfigError) {
      logger.warn('Failed to read network interfaces', {
        ipError: ipError.message,
        ifconfigError: ifconfigError.message
      });
      return {};
    }
  }
}

export function createSystemMonitorTool(options = {}) {
  const sampleMs = Number.isFinite(options.sampleMs) ? options.sampleMs : 200;

  return {
    name: 'system_monitor',
    description: 'Monitor server CPU, memory, disk, network, and uptime.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['overview', 'cpu', 'memory', 'disk', 'network'],
          description: 'Action to run: overview, cpu, memory, disk, network'
        }
      },
      required: ['action']
    },
    execute: async (args) => {
      const action = args?.action;

      try {
        switch (action) {
          case 'overview': {
            logger.info('System monitor overview');
            const cpus = os.cpus();
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            const cpuUsagePercent = await getCpuUsagePercent(sampleMs);

            return {
              hostname: os.hostname(),
              platform: `${os.type()} ${os.release()}`,
              arch: os.arch(),
              uptime: formatUptime(os.uptime()),
              cpu: {
                model: cpus[0]?.model?.trim(),
                cores: cpus.length,
                loadAvg: os.loadavg().map((load) => Number(load.toFixed(2))),
                usagePercent: `${cpuUsagePercent}%`
              },
              memory: {
                total: formatBytes(totalMem),
                used: formatBytes(usedMem),
                free: formatBytes(freeMem),
                swap: getSwapInfo()
              },
              disk: getDiskInfo()
            };
          }

          case 'cpu': {
            logger.info('System monitor cpu');
            const cpus = os.cpus();
            const cpuUsagePercent = await getCpuUsagePercent(sampleMs);

            return {
              model: cpus[0]?.model?.trim(),
              cores: cpus.length,
              loadAvg: os.loadavg().map((load) => Number(load.toFixed(2))),
              usagePercent: `${cpuUsagePercent}%`
            };
          }

          case 'memory': {
            logger.info('System monitor memory');
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;

            return {
              total: formatBytes(totalMem),
              used: formatBytes(usedMem),
              free: formatBytes(freeMem),
              swap: getSwapInfo()
            };
          }

          case 'disk': {
            logger.info('System monitor disk');
            return { disks: getDiskInfo() };
          }

          case 'network': {
            logger.info('System monitor network');
            return { interfaces: getNetworkInfo() };
          }

          default:
            throw new Error(`Unknown action: ${action}`);
        }
      } catch (error) {
        logger.error('System monitor failed', error, { action });
        throw new Error(`System monitor failed: ${error.message}`);
      }
    }
  };
}
