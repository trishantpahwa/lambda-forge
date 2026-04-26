const args = JSON.parse(process.env.PRESS_ARGS || '[]');
require('./server')(args);
