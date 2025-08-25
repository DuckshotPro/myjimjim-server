const fs = require('fs');
const path = require('path');
const logStream = fs.createWriteStream(path.join(__dirname, 'server.log'), { flags: 'a' });

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function(d) {
  const message = new Date().toISOString() + ' [LOG] ' + d + '\n';
  logStream.write(message);
  originalConsoleLog.apply(console, arguments);
};

console.error = function(d) {
  const message = new Date().toISOString() + ' [ERROR] ' + d + '\n';
  logStream.write(message);
  originalConsoleError.apply(console, arguments);
};

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const pm2 = require('pm2');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const port = config.port;
const host = config.host || '0.0.0.0';

app.use((req, res, next) => {
  if (req.path === '/') return next();
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${config.password}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

app.use(express.json());

app.post('/api/prompt', (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }
  const { exec } = require('child_process');
  exec(`gemini "${prompt.replace(/"/g, '\"')}"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return res.status(500).json({ error: stderr });
    }
    res.json({ response: stdout });
  });
});

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Gemini Chat</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
      <style>
        body {
          background-color: #212529;
          color: #f8f9fa;
        }
        #chatbox {
          height: 500px;
          overflow-y: scroll;
          border: 1px solid #495057;
          padding: 1rem;
          margin-bottom: 1rem;
          background-color: #343a40;
        }
        .message {
          margin-bottom: 1rem;
        }
        .message strong {
          color: #6c757d;
        }
        #thinking {
          display: none;
        }
      </style>
    </head>
    <body>
      <div class="container mt-5">
        <h1 class="text-center mb-4">Gemini Chat</h1>
        <div id="chatbox"></div>
        <div id="thinking" class="text-center mb-3">
          <div class="spinner-border text-light" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </div>
        <div class="input-group mb-3">
          <input type="text" id="userInput" class="form-control" placeholder="Type your message...">
          <button id="sendButton" class="btn btn-primary">Send</button>
          <button id="voiceButton" class="btn btn-secondary">Voice</button>
          <button id="clearButton" class="btn btn-danger">Clear</button>
        </div>
      </div>

      <script>
        const chatbox = document.getElementById('chatbox');
        const userInput = document.getElementById('userInput');
        const sendButton = document.getElementById('sendButton');
        const voiceButton = document.getElementById('voiceButton');
        const clearButton = document.getElementById('clearButton');
        const thinking = document.getElementById('thinking');
        const password = prompt('Enter password:');
        const ws = new WebSocket('ws://' + window.location.host + '?password=' + password);

        ws.onopen = () => {
          console.log('WebSocket connection opened');
        };

        ws.onmessage = (event) => {
          thinking.style.display = 'none';
          const data = JSON.parse(event.data);
          appendMessage(data.sender, data.message);
        };

        ws.onclose = () => {
          console.log('WebSocket connection closed');
        };

        sendButton.addEventListener('click', sendMessage);
        userInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            sendMessage();
          }
        });

        clearButton.addEventListener('click', () => {
          chatbox.innerHTML = '';
        });

        function sendMessage() {
          const message = userInput.value;
          if (message.trim() === '') return;

          thinking.style.display = 'block';
          ws.send(message);
          userInput.value = '';
        }

        function appendMessage(sender, message) {
          const messageElement = document.createElement('div');
          messageElement.classList.add('message');

          const senderElement = document.createElement('strong');
          senderElement.textContent = sender + ': ';
          messageElement.appendChild(senderElement);

          const messageTextElement = document.createElement('span');
          messageTextElement.textContent = message;
          messageElement.appendChild(messageTextElement);

          if (sender === 'Gemini') {
            const copyButton = document.createElement('button');
            copyButton.textContent = 'Copy';
            copyButton.classList.add('btn', 'btn-sm', 'btn-outline-light', 'ms-2');
            copyButton.onclick = () => {
              navigator.clipboard.writeText(message).then(() => {
                copyButton.textContent = 'Copied!';
                setTimeout(() => {
                  copyButton.textContent = 'Copy';
                }, 2000);
              });
            };
            messageElement.appendChild(copyButton);
          }

          chatbox.appendChild(messageElement);
          chatbox.scrollTop = chatbox.scrollHeight;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition) {
          const recognition = new SpeechRecognition();
          recognition.continuous = false;
          recognition.lang = 'en-US';
          recognition.interimResults = false;
          recognition.maxAlternatives = 1;

          voiceButton.addEventListener('click', () => {
            recognition.start();
          });

          recognition.onstart = () => {
            voiceButton.textContent = 'Listening...';
          };

          recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            userInput.value = transcript;
          };

          recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            voiceButton.textContent = 'Voice';
          };

          recognition.onend = () => {
            voiceButton.textContent = 'Voice';
          };
        } else {
          voiceButton.style.display = 'none';
        }
      </script>
    </body>
    </html>
  `);
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const password = url.searchParams.get('password');

  if (password !== config.password) {
    ws.send(JSON.stringify({ sender: 'System', message: 'Authentication failed. Please provide the correct password.' }));
    ws.close();
    return;
  }

  console.log('Client connected');
  
  // Send welcome message
  ws.send(JSON.stringify({ 
    sender: 'System', 
    message: 'Connected to Gemini Chat Server. Type /help for available commands.' 
  }));

  let history = [];

  // Start Gemini process with error handling
  const gemini = spawn('gemini', ['-i']);

  gemini.on('error', (error) => {
    console.error('Failed to start Gemini process:', error);
    ws.send(JSON.stringify({ 
      sender: 'System', 
      message: 'Failed to start Gemini process. Make sure Gemini CLI is installed and available in PATH.\nError: ' + error.message 
    }));
  });

  gemini.on('exit', (code, signal) => {
    if (code !== 0) {
      console.error(`Gemini process exited with code ${code}, signal ${signal}`);
      ws.send(JSON.stringify({ 
        sender: 'System', 
        message: `Gemini process exited unexpectedly (code: ${code}, signal: ${signal})` 
      }));
    }
  });

  gemini.stdout.on('data', (data) => {
    const geminiMessage = { sender: 'Gemini', message: data.toString() };
    history.push(geminiMessage);
    ws.send(JSON.stringify(geminiMessage));
  });

  gemini.stderr.on('data', (data) => {
    console.error(`Gemini stderr: ${data}`);
    ws.send(JSON.stringify({ sender: 'System', message: `Error: ${data}` }));
  });

  ws.on('message', (message) => {
    const messageString = message.toString();
    if (messageString.startsWith('/')) {
      const [command, ...args] = messageString.substring(1).split(' ');
      switch (command) {
        case 'help':
          ws.send(JSON.stringify({ sender: 'System', message: 'Available commands:\n/help - Show this help message\n/logs - Show the last 20 lines of the server log\n/restart - Restart the server\n/load <filename> - Load a file into the chat\n/save <filename> - Save the chat history to a file\n/status - Show server uptime and memory usage\n/exec <command> - Execute a system command (use with caution)' }));
          break;
        case 'logs':
          fs.readFile(path.join(__dirname, 'server.log'), 'utf8', (err, data) => {
            if (err) {
              ws.send(JSON.stringify({ sender: 'System', message: 'Error reading log file.' }));
              console.error(err);
              return;
            }
            const lines = data.trim().split('\n');
            const last20Lines = lines.slice(-20).join('\n');
            ws.send(JSON.stringify({ sender: 'System', message: last20Lines }));
          });
          break;
        case 'restart':
          ws.send(JSON.stringify({ sender: 'System', message: 'Restarting server...' }));
          pm2.restart('myjimjim', (err) => {
            if (err) {
              console.error(err);
              ws.send(JSON.stringify({ sender: 'System', message: 'Error restarting server.' }));
            }
          });
          break;
        case 'load':
          if (args.length === 0) {
            ws.send(JSON.stringify({ sender: 'System', message: 'Please provide a filename.' }));
            return;
          }
          const filename = args[0];
          fs.readFile(path.join(__dirname, filename), 'utf8', (err, data) => {
            if (err) {
              ws.send(JSON.stringify({ sender: 'System', message: `Error reading file: ${filename}` }));
              console.error(err);
              return;
            }
            const fileContent = { sender: 'System', message: `Loaded file: ${filename}\n\n${data}` };
            history.push(fileContent);
            ws.send(JSON.stringify(fileContent));
          });
          break;
        case 'save':
          if (args.length === 0) {
            ws.send(JSON.stringify({ sender: 'System', message: 'Please provide a filename.' }));
            return;
          }
          const saveFilename = args[0];
          fs.writeFile(path.join(__dirname, saveFilename), JSON.stringify(history, null, 2), (err) => {
            if (err) {
              ws.send(JSON.stringify({ sender: 'System', message: `Error saving file: ${saveFilename}` }));
              console.error(err);
              return;
            }
            ws.send(JSON.stringify({ sender: 'System', message: `Chat history saved to: ${saveFilename}` }));
          });
          break;
        case 'status':
          const uptime = process.uptime();
          const memoryUsage = process.memoryUsage();
          ws.send(JSON.stringify({ sender: 'System', message: `Server uptime: ${uptime.toFixed(2)}s\nMemory usage: ${JSON.stringify(memoryUsage)}` }));
          break;
        case 'exec':
          if (args.length === 0) {
            ws.send(JSON.stringify({ sender: 'System', message: 'Please provide a command to execute.' }));
            return;
          }
          const execCommand = args.join(' ');
          const { exec } = require('child_process');
          exec(execCommand, { timeout: 10000 }, (error, stdout, stderr) => {
            if (error) {
              ws.send(JSON.stringify({ sender: 'System', message: `Command failed: ${error.message}` }));
              return;
            }
            const output = stdout || stderr || 'Command executed successfully (no output)';
            ws.send(JSON.stringify({ sender: 'System', message: `Command output:\n${output}` }));
          });
          break;
        default:
          ws.send(JSON.stringify({ sender: 'System', message: `Unknown command: ${command}` }));
      }
    } else {
      const userMessage = { sender: 'You', message: messageString };
      history.push(userMessage);
      ws.send(JSON.stringify(userMessage));
      gemini.stdin.write(messageString + '\n');
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    if (gemini && !gemini.killed) {
      gemini.kill('SIGTERM');
      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (!gemini.killed) {
          gemini.kill('SIGKILL');
        }
      }, 5000);
    }
  });
});

server.listen(port, host, () => {
  console.log(`Server listening at http://${host}:${port}`);
});
