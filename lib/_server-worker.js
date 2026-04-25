const args = JSON.parse(process.env.FORGE_ARGS || '[]');
require('./server')(args);
