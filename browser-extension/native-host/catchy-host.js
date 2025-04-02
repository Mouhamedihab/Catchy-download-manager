#!/usr/bin/env node

const net = require('net');

// Function to read messages from the browser
function readMessage() {
  return new Promise((resolve) => {
    let buffer = Buffer.alloc(0);
    
    // First 4 bytes are the length
    process.stdin.once('readable', () => {
      const header = process.stdin.read(4);
      if (!header) {
        resolve(null);
        return;
      }
      
      const length = header.readUInt32LE(0);
      let chunk;
      
      while (null !== (chunk = process.stdin.read())) {
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.length >= length) {
          const message = buffer.slice(0, length).toString();
          resolve(JSON.parse(message));
          break;
        }
      }
    });
  });
}

// Function to write messages back to the browser
function writeMessage(message) {
  const json = JSON.stringify(message);
  const buffer = Buffer.from(json);
  const header = Buffer.alloc(4);
  header.writeUInt32LE(buffer.length, 0);
  process.stdout.write(Buffer.concat([header, buffer]));
}

// Connect to Catchy's TCP server
const client = new net.Socket();
client.connect(43210, '127.0.0.1', () => {
  console.error('Connected to Catchy');
});

// Handle messages from the browser extension
async function handleMessages() {
  while (true) {
    const message = await readMessage();
    if (!message) break;
    
    if (message.action === 'download') {
      // Send the download request to Catchy
      client.write(JSON.stringify({
        type: 'download',
        url: message.url
      }) + '\n');
      
      // Send success response back to the browser
      writeMessage({ success: true });
    }
  }
}

// Handle errors
client.on('error', (error) => {
  console.error('Connection error:', error);
  writeMessage({ success: false, error: 'Failed to connect to Catchy' });
  process.exit(1);
});

// Start handling messages
handleMessages().catch((error) => {
  console.error('Error handling messages:', error);
  process.exit(1);
}); 