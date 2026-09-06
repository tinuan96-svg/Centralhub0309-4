type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  data?: any;
  timestamp: number;
}

class ErrorLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 100;

  log(level: LogLevel, message: string, data?: any) {
    const entry: LogEntry = {
      level,
      message,
      data,
      timestamp: Date.now(),
    };

    this.logs.push(entry);

    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    if (process.env.NODE_ENV === 'development') {
      const method = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      method(`[${level.toUpperCase()}]`, message, data || '');
    }
  }

  error(message: string, error?: any) {
    this.log('error', message, error);
  }

  warn(message: string, data?: any) {
    this.log('warn', message, data);
  }

  info(message: string, data?: any) {
    this.log('info', message, data);
  }

  getLogs() {
    return [...this.logs];
  }

  clear() {
    this.logs = [];
  }
}

export const logger = new ErrorLogger();
