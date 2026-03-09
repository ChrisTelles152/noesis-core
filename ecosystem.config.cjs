module.exports = {
  apps: [{
    name: 'noesis',
    script: 'dist/index.js',
    cwd: '/root/projects/noesis/noesis-core',
    env: {
      NODE_ENV: 'production',
      PORT: 3013,
      HOST: '0.0.0.0',
      SQLITE_PATH: './data/noesis.sqlite',
      SESSION_SECRET: 'S1XKPFsLM3FD6EBm7oPRf5WmwDJvnUMYxWaATHD40r0=',
      OPENAI_API_KEY: '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',
      OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
      ALLOWED_ORIGINS: 'https://noesis.xcaptools.com,https://noesis.xcaphq.com',
      LOG_LEVEL: 'info'
    }
  }]
};
