const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const os = require('os');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongodb:27017/taskflow';
const NODE_ENV = process.env.NODE_ENV || 'production';

// Middleware
app.use(cors());
app.use(express.json());

// Log incoming API requests
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Task Schema
const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
      lowercase: true,
    },
    status: {
      type: String,
      enum: ['todo', 'in_progress', 'completed'],
      default: 'todo',
      lowercase: true,
    },
    category: {
      type: String,
      enum: ['Infrastructure', 'DevOps', 'Feature', 'Bug', 'Security'],
      default: 'DevOps',
    },
  },
  {
    timestamps: true,
  }
);

const Task = mongoose.model('Task', taskSchema);

// -------------------------------------------------------------
// REST API Endpoints
// -------------------------------------------------------------

// 1. Health Check Endpoint
app.get('/api/health', async (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;

  let taskCount = 0;
  if (isDbConnected) {
    try {
      taskCount = await Task.countDocuments();
    } catch (err) {
      console.warn('Could not fetch task count for healthcheck:', err.message);
    }
  }

  const healthData = {
    status: isDbConnected ? 'ok' : 'degraded',
    service: 'taskflow-backend',
    environment: NODE_ENV,
    database: {
      status: isDbConnected ? 'connected' : 'disconnected',
      host: mongoose.connection.host || 'mongodb',
      port: mongoose.connection.port || 27017,
      name: mongoose.connection.name || 'taskflow',
      totalRecords: taskCount,
    },
    container: {
      hostname: os.hostname(),
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      platform: `${os.type()} ${os.arch()}`,
    },
    timestamp: new Date().toISOString(),
  };

  res.status(isDbConnected ? 200 : 503).json(healthData);
});

// 2. Fetch All Tasks
app.get('/api/tasks', async (req, res) => {
  try {
    const { priority, status } = req.query;
    const filter = {};

    if (priority && ['low', 'medium', 'high'].includes(priority.toLowerCase())) {
      filter.priority = priority.toLowerCase();
    }

    if (status && ['todo', 'in_progress', 'completed'].includes(status.toLowerCase())) {
      filter.status = status.toLowerCase();
    }

    const tasks = await Task.find(filter).sort({ createdAt: -1 });
    res.json({
      success: true,
      count: tasks.length,
      data: tasks,
    });
  } catch (error) {
    console.error('Error fetching tasks:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve tasks from database',
    });
  }
});

// 3. Create New Task
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, priority, status, category } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed: Title is required and cannot be empty.',
      });
    }

    const newTask = new Task({
      title: title.trim(),
      description: description ? description.trim() : '',
      priority: priority || 'medium',
      status: status || 'todo',
      category: category || 'DevOps',
    });

    const savedTask = await newTask.save();
    console.log(`[Task Created] ID: ${savedTask._id} | Title: "${savedTask.title}"`);

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      data: savedTask,
    });
  } catch (error) {
    console.error('Error creating task:', error.message);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    res.status(500).json({
      success: false,
      error: 'Failed to create task in database',
    });
  }
});

// 4. Update Task Status (Optional convenience helper)
app.patch('/api/tasks/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid Task ID format' });
    }

    if (!['todo', 'in_progress', 'completed'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status value' });
    }

    const updatedTask = await Task.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!updatedTask) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    res.json({
      success: true,
      message: 'Task status updated',
      data: updatedTask,
    });
  } catch (error) {
    console.error('Error updating task:', error.message);
    res.status(500).json({ success: false, error: 'Failed to update task' });
  }
});

// 5. Delete Task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid Task ID format' });
    }

    const deletedTask = await Task.findByIdAndDelete(id);

    if (!deletedTask) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    console.log(`[Task Deleted] ID: ${id}`);
    res.json({
      success: true,
      message: 'Task deleted successfully',
      data: { id },
    });
  } catch (error) {
    console.error('Error deleting task:', error.message);
    res.status(500).json({ success: false, error: 'Failed to delete task' });
  }
});

// 6. Seed Demo Records
app.post('/api/tasks/seed', async (req, res) => {
  try {
    const defaultTasks = [
      {
        title: 'Configure Custom Docker Bridge Network',
        description: 'Establish taskflow-network for isolated container-to-container service discovery.',
        priority: 'high',
        status: 'completed',
        category: 'DevOps',
      },
      {
        title: 'Mount Persistent Named Volume for MongoDB',
        description: 'Attach taskflow-mongo-data to /data/db so application data survives container recreation.',
        priority: 'high',
        status: 'in_progress',
        category: 'Infrastructure',
      },
      {
        title: 'Setup Nginx Reverse Proxy and Port Forwarding',
        description: 'Expose port 8080 on the host to route frontend traffic and proxy /api/* to backend.',
        priority: 'medium',
        status: 'todo',
        category: 'Infrastructure',
      },
    ];

    const inserted = await Task.insertMany(defaultTasks);
    res.status(201).json({
      success: true,
      message: `Seeded ${inserted.length} demo tasks successfully`,
      data: inserted,
    });
  } catch (error) {
    console.error('Error seeding tasks:', error.message);
    res.status(500).json({ success: false, error: 'Failed to seed demo tasks' });
  }
});

// 7. Stats Summary Endpoint
app.get('/api/stats', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ success: false, error: 'Database disconnected' });
    }

    const [total, highPriority, inProgress, completed] = await Promise.all([
      Task.countDocuments(),
      Task.countDocuments({ priority: 'high' }),
      Task.countDocuments({ status: 'in_progress' }),
      Task.countDocuments({ status: 'completed' }),
    ]);

    res.json({
      success: true,
      stats: {
        total,
        highPriority,
        inProgress,
        completed,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to compute stats' });
  }
});

// -------------------------------------------------------------
// Database Connection & Server Initialization
// -------------------------------------------------------------

const connectWithRetry = async (retryCount = 0) => {
  const maxRetries = 15;
  const retryInterval = 3000; // 3 seconds

  console.log(`[MongoDB] Connecting to ${MONGODB_URI} (Attempt ${retryCount + 1}/${maxRetries})...`);

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: true,
    });
    console.log(`[MongoDB] Connected successfully to ${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`);
  } catch (err) {
    console.error(`[MongoDB] Connection error: ${err.message}`);
    if (retryCount < maxRetries) {
      console.log(`[MongoDB] Retrying connection in ${retryInterval / 1000}s...`);
      setTimeout(() => connectWithRetry(retryCount + 1), retryInterval);
    } else {
      console.error('[MongoDB] Max connection retries reached. Running in degraded mode.');
    }
  }
};

// Start Express Server
const server = app.listen(PORT, () => {
  console.log('====================================================');
  console.log(` TaskFlow Backend Service running on port ${PORT}`);
  console.log(` Container Hostname: ${os.hostname()}`);
  console.log(` Environment: ${NODE_ENV}`);
  console.log('====================================================');
  connectWithRetry();
});

// Graceful Shutdown
const handleShutdown = (signal) => {
  console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    console.log('[Server] HTTP server closed.');
    try {
      await mongoose.connection.close(false);
      console.log('[MongoDB] Database connection closed.');
    } catch (err) {
      console.error('[MongoDB] Error closing connection:', err.message);
    }
    process.exit(0);
  });
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
