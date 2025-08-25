# Gemini Chat Server

A Node.js server that provides a web interface for interacting with the Gemini command line tool while preserving its full command line capabilities.

## Features

- Web-based chat interface for Gemini
- WebSocket real-time communication
- System command execution capabilities
- Chat history saving and loading
- Server administration commands
- External access support for Android/Termux

## Requirements

- Node.js
- Gemini CLI tool installed and available in PATH
- PM2 (for server restart functionality)

## Setup for Android/Termux

1. Install Node.js in Termux:
   ```bash
   pkg install nodejs
   ```

2. Install Gemini CLI tool in Termux
   
3. Install dependencies:
   ```bash
   npm install
   ```

4. Configure the server:
   - Edit `config.json` to set port and password
   - Default host binding is `0.0.0.0` for external access

5. Start the server:
   ```bash
   node index.js
   ```

## Configuration

Edit `config.json`:
```json
{
  "port": 8080,
  "host": "0.0.0.0",
  "password": "changeme"
}
```

- `port`: Server port number
- `host`: Host to bind to (`0.0.0.0` for all interfaces, `localhost` for local only)
- `password`: Authentication password for web interface

## Available Commands

- `/help` - Show help message
- `/logs` - Show last 20 lines of server log
- `/restart` - Restart the server
- `/load <filename>` - Load a file into chat
- `/save <filename>` - Save chat history to file
- `/status` - Show server uptime and memory usage
- `/exec <command>` - Execute system command (use with caution)

## Architecture

The server runs Gemini as a background process and mirrors its input/output through a web interface, preserving all command line capabilities while providing a user-friendly interface accessible via web browser or Android app.