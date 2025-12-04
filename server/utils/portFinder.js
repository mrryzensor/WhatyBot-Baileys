import net from 'net';

/**
 * Checks if a port is available
 * @param {number} port - Port number to check
 * @returns {Promise<boolean>} - True if port is available
 */
export function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.listen(port, () => {
      server.once('close', () => {
        resolve(true);
      });
      server.close();
    });
    
    server.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Common ports to avoid (Vite, Express, common dev servers, etc.)
 */
const COMMON_PORTS_TO_AVOID = new Set([
  3000, 3001, 5173, 5174, 5175, 8000, 8080, 5000, 4000, 9000,
  3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009,
  8001, 8002, 8003, 8081, 8082, 8083,
  5001, 5002, 5003, 4001, 4002, 4003,
  9001, 9002, 9003
]);

/**
 * Finds the next available port starting from a given port
 * Automatically skips common ports to avoid conflicts
 * Searches without restrictions until finding an available port (within valid TCP port range 1-65535)
 * @param {number} startPort - Starting port number
 * @param {number} maxAttempts - Maximum number of ports to try (default: unlimited, searches all ports from startPort to 65535)
 * @returns {Promise<number>} - Available port number
 */
export async function findAvailablePort(startPort, maxAttempts = null) {
  // Valid port range is 1-65535
  const MAX_PORT = 65535;
  const MIN_PORT = 1;
  
  // Ensure startPort is within valid range
  const currentPort = Math.max(MIN_PORT, Math.min(MAX_PORT, startPort));
  
  // Calculate how many ports we can search from startPort to MAX_PORT
  const maxPossibleAttempts = MAX_PORT - currentPort + 1;
  
  // If maxAttempts is not specified, search all ports from startPort to MAX_PORT
  const attempts = maxAttempts !== null ? Math.min(maxAttempts, maxPossibleAttempts) : maxPossibleAttempts;
  
  let checkedPorts = 0;
  
  // Search from startPort upwards, skipping common ports
  for (let i = 0; i < attempts && checkedPorts < attempts; i++) {
    const port = currentPort + i;
    if (port > MAX_PORT) {
      break;
    }
    
    // Skip common ports
    if (COMMON_PORTS_TO_AVOID.has(port)) {
      continue;
    }
    
    checkedPorts++;
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
  }
  
  // If we didn't find one and maxAttempts wasn't specified, try wrapping around from MIN_PORT
  if (maxAttempts === null && currentPort > MIN_PORT) {
    for (let port = MIN_PORT; port < currentPort; port++) {
      // Skip common ports
      if (COMMON_PORTS_TO_AVOID.has(port)) {
        continue;
      }
      const available = await isPortAvailable(port);
      if (available) {
        return port;
      }
    }
  }
  
  throw new Error(`No available port found starting from ${startPort} (checked ${checkedPorts} ports, skipping common ports)`);
}

