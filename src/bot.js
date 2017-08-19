let trexBotInterval = 0;
let trexBotOn = false;

// Modified from https://github.com/chirag64/t-rex-runner-bot/blob/gh-pages/scripts/bot.js
function startBot(runner, interval = 2) {
  return (trexBotInterval = setInterval(() => {
    const trex = runner.tRex;
    const obstacles = runner.horizon.obstacles;
    if (
      !trex.jumping &&
      obstacles.length > 0 &&
      obstacles[0].xPos + obstacles[0].width <=
        (parseInt(runner.currentSpeed - 0.1) - 5) * 34 + 160 &&
      obstacles[0].xPos + obstacles[0].width > 20
    ) {
      trex.startJump();
    }
  }, interval));
  return (trexBotOn = true);
}

function stopBot() {
  clearInterval(trexBotInterval);
  return (trexBotOn = false);
}

export default function toggleBot(runner, interval) {
  if (trexBotOn) {
    return stopBot();
  } else {
    return startBot(runner, interval);
  }
}
