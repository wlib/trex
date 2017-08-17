import * as utils from "./utils.js";
import * as flags from "./flags.js";
import checkForCollision from "./checkforcollision.js";
import Horizon from "./horizon.js";
import DistanceMeter from "./distancemeter.js";
import GameOverPanel from "./gameoverpanel.js";
import Trex from "./trex.js";

/**
 * T-Rex runner.
 * @param {string} outerContainerId Outer containing element id.
 * @param {Object} opt_config
 * @constructor
 * @export
 */
class Runner {
  constructor(outerContainerId, opt_config) {
    // Singleton
    if (Runner.instance_) {
      return Runner.instance_;
    }
    Runner.instance_ = this;

    this.outerContainerEl = document.querySelector(outerContainerId);
    this.containerEl = null;
    this.snackbarEl = null;

    this.config = opt_config || Runner.config;
    // Logical dimensions of the container.
    this.dimensions = Runner.defaultDimensions;

    this.canvas = null;
    this.canvasCtx = null;

    this.tRex = null;

    this.distanceMeter = null;
    this.distanceRan = 0;

    this.highestScore = 0;

    this.time = 0;
    this.runningTime = 0;
    this.msPerFrame = 1000 / flags.FPS;
    this.currentSpeed = this.config.SPEED;

    this.obstacles = [];

    this.activated = false; // Whether the easter egg has been activated.
    this.playing = false; // Whether the game is currently in play state.
    this.crashed = false;
    this.paused = false;
    this.inverted = false;
    this.invertTimer = 0;
    this.resizeTimerId_ = null;

    this.playCount = 0;

    // Sound FX.
    this.audioBuffer = null;
    this.soundFx = {};

    // Global web audio context for playing sounds.
    this.audioContext = null;

    // Images.
    this.images = {};
    this.imagesLoaded = 0;
    this.loadImages();
  }

  /**
   * Setting individual settings for debugging.
   * @param {string} setting
   * @param {*} value
   */
  updateConfigSetting(setting, value) {
    if (setting in this.config && value != undefined) {
      this.config[setting] = value;

      switch (setting) {
        case "GRAVITY":
        case "MIN_JUMP_HEIGHT":
        case "SPEED_DROP_COEFFICIENT":
          this.tRex.config[setting] = value;
          break;
        case "INITIAL_JUMP_VELOCITY":
          this.tRex.setJumpVelocity(value);
          break;
        case "SPEED":
          this.setSpeed(value);
          break;
      }
    }
  }

  /**
   * Cache the appropriate image sprite from the page and get the sprite sheet
   * definition.
   */
  loadImages() {
    if (flags.isHiDPI) {
      Runner.imageSprite = document.getElementById("sprites-2x");
      this.spriteDef = Runner.spriteDefinition.HDPI;
    } else {
      Runner.imageSprite = document.getElementById("sprites-1x");
      this.spriteDef = Runner.spriteDefinition.LDPI;
    }

    if (Runner.imageSprite.complete) {
      this.init();
    } else {
      // If the images are not yet loaded, add a listener.
      Runner.imageSprite.addEventListener(
        Runner.events.LOAD,
        this.init.bind(this)
      );
    }
  }

  /**
   * Load and decode base 64 encoded sounds.
   */
  loadSounds() {
    if (!flags.isIOS) {
      this.audioContext = new AudioContext();

      var resourceTemplate = document.getElementById(
        this.config.RESOURCE_TEMPLATE_ID
      ).content;

      for (var sound in Runner.sounds) {
        var soundSrc = resourceTemplate.getElementById(Runner.sounds[sound])
          .src;
        soundSrc = soundSrc.substr(soundSrc.indexOf(",") + 1);
        var buffer = utils.decodeBase64ToArrayBuffer(soundSrc);

        // Async, so no guarantee of order in array.
        this.audioContext.decodeAudioData(buffer, (index, audioData) => {
          this.soundFx[index] = audioData;
        });
      }
    }
  }

  /**
   * Sets the game speed. Adjust the speed accordingly if on a smaller screen.
   * @param {number} opt_speed
   */
  setSpeed(opt_speed) {
    var speed = opt_speed || this.currentSpeed;

    // Reduce the speed on smaller mobile screens.
    if (this.dimensions.WIDTH < flags.defaultWidth) {
      var mobileSpeed =
        speed *
        this.dimensions.WIDTH /
        flags.defaultWidth *
        this.config.MOBILE_SPEED_COEFFICIENT;
      this.currentSpeed = mobileSpeed > speed ? speed : mobileSpeed;
    } else if (opt_speed) {
      this.currentSpeed = opt_speed;
    }
  }

  /**
   * Game initialiser.
   */
  init() {
    // Hide the static icon.
    document.querySelector("." + Runner.classes.ICON).style.visibility =
      "hidden";

    this.adjustDimensions();
    this.setSpeed();

    this.containerEl = document.createElement("div");
    this.containerEl.className = Runner.classes.CONTAINER;

    // Player canvas container.
    this.canvas = document.createElement("canvas");
    this.canvas.className = this.containerEl
      ? Runner.classes.CANVAS + " " + this.containerEl
      : Runner.classes.CANVAS;
    this.canvas.width = this.dimensions.WIDTH;
    this.canvas.height = this.dimensions.HEIGHT;
    this.containerEl.appendChild(this.canvas);

    this.canvasCtx = this.canvas.getContext("2d");
    this.canvasCtx.fillStyle = "#f7f7f7";
    this.canvasCtx.fill();
    Runner.updateCanvasScaling(this.canvas);

    // Horizon contains clouds, obstacles and the ground.
    this.horizon = new Horizon(
      this.canvas,
      this.spriteDef,
      this.dimensions,
      this.config.GAP_COEFFICIENT
    );

    // Distance meter
    this.distanceMeter = new DistanceMeter(
      this.canvas,
      this.spriteDef.TEXT_SPRITE,
      this.dimensions.WIDTH
    );

    // Draw t-rex
    this.tRex = new Trex(this.canvas, this.spriteDef.TREX);

    this.outerContainerEl.appendChild(this.containerEl);

    if (flags.isMobile) {
      this.createTouchController();
    }

    this.startListening();
    this.update();

    window.addEventListener(
      Runner.events.RESIZE,
      this.debounceResize.bind(this)
    );
  }

  /**
   * Create the touch controller. A div that covers whole screen.
   */
  createTouchController() {
    this.touchController = document.createElement("div");
    this.touchController.className = Runner.classes.TOUCH_CONTROLLER;
  }

  /**
   * Debounce the resize event.
   */
  debounceResize() {
    if (!this.resizeTimerId_) {
      this.resizeTimerId_ = setInterval(this.adjustDimensions.bind(this), 250);
    }
  }

  /**
   * Adjust game space dimensions on resize.
   */
  adjustDimensions() {
    clearInterval(this.resizeTimerId_);
    this.resizeTimerId_ = null;

    var boxStyles = window.getComputedStyle(this.outerContainerEl);
    var padding = Number(
      boxStyles.paddingLeft.substr(0, boxStyles.paddingLeft.length - 2)
    );

    this.dimensions.WIDTH = this.outerContainerEl.offsetWidth - padding * 2;
    if (this.isArcadeMode()) {
      this.dimensions.WIDTH = Math.min(
        flags.defaultWidth,
        this.dimensions.WIDTH
      );
      if (this.activated) {
        this.setArcadeModeContainerScale();
      }
    }

    // Redraw the elements back onto the canvas.
    if (this.canvas) {
      this.canvas.width = this.dimensions.WIDTH;
      this.canvas.height = this.dimensions.HEIGHT;

      Runner.updateCanvasScaling(this.canvas);

      this.distanceMeter.calcXPos(this.dimensions.WIDTH);
      this.clearCanvas();
      this.horizon.update(0, 0, true);
      this.tRex.update(0);

      // Outer container and distance meter.
      if (this.playing || this.crashed || this.paused) {
        this.containerEl.style.width = this.dimensions.WIDTH + "px";
        this.containerEl.style.height = this.dimensions.HEIGHT + "px";
        this.distanceMeter.update(0, Math.ceil(this.distanceRan));
        this.stop();
      } else {
        this.tRex.draw(0, 0);
      }

      // Game over panel.
      if (this.crashed && this.gameOverPanel) {
        this.gameOverPanel.updateDimensions(this.dimensions.WIDTH);
        this.gameOverPanel.draw();
      }
    }
  }

  /**
 * Updates the canvas size taking into
 * account the backing store pixel ratio and
 * the device pixel ratio.
 *
 * See article by Paul Lewis:
 * http://www.html5rocks.com/en/tutorials/canvas/hidpi/
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number} opt_width
 * @param {number} opt_height
 * @return {boolean} Whether the canvas was scaled.
 */
  static updateCanvasScaling(canvas, opt_width, opt_height) {
    var context = canvas.getContext("2d");

    // Query the various pixel ratios
    var devicePixelRatio = Math.floor(window.devicePixelRatio) || 1;
    var backingStoreRatio =
      Math.floor(context.webkitBackingStorePixelRatio) || 1;
    var ratio = devicePixelRatio / backingStoreRatio;

    // Upscale the canvas if the two ratios don't match
    if (devicePixelRatio !== backingStoreRatio) {
      var oldWidth = opt_width || canvas.width;
      var oldHeight = opt_height || canvas.height;

      canvas.width = oldWidth * ratio;
      canvas.height = oldHeight * ratio;

      canvas.style.width = oldWidth + "px";
      canvas.style.height = oldHeight + "px";

      // Scale the context to counter the fact that we've manually scaled
      // our canvas element.
      context.scale(ratio, ratio);
      return true;
    } else if (devicePixelRatio == 1) {
      // Reset the canvas width / height. Fixes scaling bug when the page is
      // zoomed and the devicePixelRatio changes accordingly.
      canvas.style.width = canvas.width + "px";
      canvas.style.height = canvas.height + "px";
    }
    return false;
  }

  /**
   * Play the game intro.
   * Canvas container width expands out to the full width.
   */
  playIntro() {
    if (!this.activated && !this.crashed) {
      this.playingIntro = true;
      this.tRex.playingIntro = true;

      // CSS animation definition.
      var keyframes =
        "@-webkit-keyframes intro { " +
        "from { width:" +
        Trex.config.WIDTH +
        "px }" +
        "to { width: " +
        this.dimensions.WIDTH +
        "px }" +
        "}";
      document.styleSheets[0].insertRule(keyframes, 0);

      this.containerEl.addEventListener(
        Runner.events.ANIM_END,
        this.startGame.bind(this)
      );

      this.containerEl.style.webkitAnimation = "intro .4s ease-out 1 both";
      this.containerEl.style.width = this.dimensions.WIDTH + "px";

      if (this.touchController) {
        this.outerContainerEl.appendChild(this.touchController);
      }
      this.playing = true;
      this.activated = true;
    } else if (this.crashed) {
      this.restart();
    }
  }

  /**
   * Update the game status to started.
   */
  startGame() {
    if (this.isArcadeMode()) {
      this.setArcadeMode();
    }
    this.runningTime = 0;
    this.playingIntro = false;
    this.tRex.playingIntro = false;
    this.containerEl.style.webkitAnimation = "";
    this.playCount++;

    // Handle tabbing off the page. Pause the current game.
    document.addEventListener(
      Runner.events.VISIBILITY,
      this.onVisibilityChange.bind(this)
    );

    window.addEventListener(
      Runner.events.BLUR,
      this.onVisibilityChange.bind(this)
    );

    window.addEventListener(
      Runner.events.FOCUS,
      this.onVisibilityChange.bind(this)
    );
  }

  clearCanvas() {
    this.canvasCtx.clearRect(
      0,
      0,
      this.dimensions.WIDTH,
      this.dimensions.HEIGHT
    );
  }

  /**
   * Update the game frame and schedules the next one.
   */
  update() {
    this.updatePending = false;

    var now = utils.getTimeStamp();
    var deltaTime = now - (this.time || now);
    this.time = now;

    if (this.playing) {
      this.clearCanvas();

      if (this.tRex.jumping) {
        this.tRex.updateJump(deltaTime);
      }

      this.runningTime += deltaTime;
      var hasObstacles = this.runningTime > this.config.CLEAR_TIME;

      // First jump triggers the intro.
      if (this.tRex.jumpCount == 1 && !this.playingIntro) {
        this.playIntro();
      }

      // The horizon doesn't move until the intro is over.
      if (this.playingIntro) {
        this.horizon.update(0, this.currentSpeed, hasObstacles);
      } else {
        deltaTime = !this.activated ? 0 : deltaTime;
        this.horizon.update(
          deltaTime,
          this.currentSpeed,
          hasObstacles,
          this.inverted
        );
      }

      // Check for collisions.
      var collision =
        hasObstacles && checkForCollision(this.horizon.obstacles[0], this.tRex);

      if (!collision) {
        this.distanceRan += this.currentSpeed * deltaTime / this.msPerFrame;

        if (this.currentSpeed < this.config.MAX_SPEED) {
          this.currentSpeed += this.config.ACCELERATION;
        }
      } else {
        this.gameOver();
      }

      var playAchievementSound = this.distanceMeter.update(
        deltaTime,
        Math.ceil(this.distanceRan)
      );

      if (playAchievementSound) {
        this.playSound(this.soundFx.SCORE);
      }

      // Night mode.
      if (this.invertTimer > this.config.INVERT_FADE_DURATION) {
        this.invertTimer = 0;
        this.invertTrigger = false;
        this.invert();
      } else if (this.invertTimer) {
        this.invertTimer += deltaTime;
      } else {
        var actualDistance = this.distanceMeter.getActualDistance(
          Math.ceil(this.distanceRan)
        );

        if (actualDistance > 0) {
          this.invertTrigger = !(actualDistance % this.config.INVERT_DISTANCE);

          if (this.invertTrigger && this.invertTimer === 0) {
            this.invertTimer += deltaTime;
            this.invert();
          }
        }
      }
    }

    if (
      this.playing ||
      (!this.activated && this.tRex.blinkCount < Runner.config.MAX_BLINK_COUNT)
    ) {
      this.tRex.update(deltaTime);
      this.scheduleNextUpdate();
    }
  }

  /**
   * Event handler.
   */
  handleEvent(e) {
    return ((evtType, events) => {
      switch (evtType) {
        case events.KEYDOWN:
        case events.TOUCHSTART:
        case events.MOUSEDOWN:
          this.onKeyDown(e);
          break;
        case events.KEYUP:
        case events.TOUCHEND:
        case events.MOUSEUP:
          this.onKeyUp(e);
          break;
      }
    })(e.type, Runner.events);
  }

  /**
   * Bind relevant key / mouse / touch listeners.
   */
  startListening() {
    // Keys.
    document.addEventListener(Runner.events.KEYDOWN, this);
    document.addEventListener(Runner.events.KEYUP, this);

    if (flags.isMobile) {
      // Mobile only touch devices.
      this.touchController.addEventListener(Runner.events.TOUCHSTART, this);
      this.touchController.addEventListener(Runner.events.TOUCHEND, this);
      this.containerEl.addEventListener(Runner.events.TOUCHSTART, this);
    } else {
      // Mouse.
      document.addEventListener(Runner.events.MOUSEDOWN, this);
      document.addEventListener(Runner.events.MOUSEUP, this);
    }
  }

  /**
   * Remove all listeners.
   */
  stopListening() {
    document.removeEventListener(Runner.events.KEYDOWN, this);
    document.removeEventListener(Runner.events.KEYUP, this);

    if (flags.isMobile) {
      this.touchController.removeEventListener(Runner.events.TOUCHSTART, this);
      this.touchController.removeEventListener(Runner.events.TOUCHEND, this);
      this.containerEl.removeEventListener(Runner.events.TOUCHSTART, this);
    } else {
      document.removeEventListener(Runner.events.MOUSEDOWN, this);
      document.removeEventListener(Runner.events.MOUSEUP, this);
    }
  }

  /**
   * Process keydown.
   * @param {Event} e
   */
  onKeyDown(e) {
    // Prevent native page scrolling whilst tapping on mobile.
    if (flags.isMobile && this.playing) {
      e.preventDefault();
    }

    if (!this.crashed && !this.paused) {
      if (
        Runner.keycodes.JUMP[e.keyCode] ||
        e.type == Runner.events.TOUCHSTART
      ) {
        e.preventDefault();
        // Starting the game for the first time.
        if (!this.playing) {
          this.loadSounds();
          this.playing = true;
          this.update();
          if (window.errorPageController) {
            errorPageController.trackEasterEgg();
          }
        }
        // Start jump.
        if (!this.tRex.jumping && !this.tRex.ducking) {
          this.playSound(this.soundFx.BUTTON_PRESS);
          this.tRex.startJump(this.currentSpeed);
        }
      } else if (this.playing && Runner.keycodes.DUCK[e.keyCode]) {
        e.preventDefault();
        if (this.tRex.jumping) {
          // Speed drop, activated only when jump key is not pressed.
          this.tRex.setSpeedDrop();
        } else if (!this.tRex.jumping && !this.tRex.ducking) {
          // Duck.
          this.tRex.setDuck(true);
        }
      }
    } else if (
      this.crashed &&
      e.type == Runner.events.TOUCHSTART &&
      e.currentTarget == this.containerEl
    ) {
      this.restart();
    }
  }

  /**
   * Process key up.
   * @param {Event} e
   */
  onKeyUp(e) {
    var keyCode = String(e.keyCode);
    var isjumpKey =
      Runner.keycodes.JUMP[keyCode] ||
      e.type == Runner.events.TOUCHEND ||
      e.type == Runner.events.MOUSEDOWN;

    if (this.isRunning() && isjumpKey) {
      this.tRex.endJump();
    } else if (Runner.keycodes.DUCK[keyCode]) {
      this.tRex.speedDrop = false;
      this.tRex.setDuck(false);
    } else if (this.crashed) {
      // Check that enough time has elapsed before allowing jump key to restart.
      var deltaTime = utils.getTimeStamp() - this.time;

      if (
        Runner.keycodes.RESTART[keyCode] ||
        this.isLeftClickOnCanvas(e) ||
        (deltaTime >= this.config.GAMEOVER_CLEAR_TIME &&
          Runner.keycodes.JUMP[keyCode])
      ) {
        this.restart();
      }
    } else if (this.paused && isjumpKey) {
      // Reset the jump state
      this.tRex.reset();
      this.play();
    }
  }

  /**
   * Returns whether the event was a left click on canvas.
   * On Windows right click is registered as a click.
   * @param {Event} e
   * @return {boolean}
   */
  isLeftClickOnCanvas(e) {
    return (
      e.button != null &&
      e.button < 2 &&
      e.type == Runner.events.MOUSEUP &&
      e.target == this.canvas
    );
  }

  /**
   * RequestAnimationFrame wrapper.
   */
  scheduleNextUpdate() {
    if (!this.updatePending) {
      this.updatePending = true;
      this.raqId = requestAnimationFrame(this.update.bind(this));
    }
  }

  /**
   * Whether the game is running.
   * @return {boolean}
   */
  isRunning() {
    return !!this.raqId;
  }

  /**
   * Game over state.
   */
  gameOver() {
    this.playSound(this.soundFx.HIT);

    if (flags.isMobile && window.navigator.vibrate) {
      window.navigator.vibrate(200);
    }

    this.stop();
    this.crashed = true;
    this.distanceMeter.acheivement = false;

    this.tRex.update(100, Trex.status.CRASHED);

    // Game over panel.
    if (!this.gameOverPanel) {
      this.gameOverPanel = new GameOverPanel(
        this.canvas,
        this.spriteDef.TEXT_SPRITE,
        this.spriteDef.RESTART,
        this.dimensions
      );
    } else {
      this.gameOverPanel.draw();
    }

    // Update the high score.
    if (this.distanceRan > this.highestScore) {
      this.highestScore = Math.ceil(this.distanceRan);
      this.distanceMeter.setHighScore(this.highestScore);
    }

    // Reset the time clock.
    this.time = utils.getTimeStamp();
  }

  stop() {
    this.playing = false;
    this.paused = true;
    cancelAnimationFrame(this.raqId);
    this.raqId = 0;
  }

  play() {
    if (!this.crashed) {
      this.playing = true;
      this.paused = false;
      this.tRex.update(0, Trex.status.RUNNING);
      this.time = utils.getTimeStamp();
      this.update();
    }
  }

  restart() {
    if (!this.raqId) {
      this.playCount++;
      this.runningTime = 0;
      this.playing = true;
      this.paused = false;
      this.crashed = false;
      this.distanceRan = 0;
      this.setSpeed(this.config.SPEED);
      this.time = utils.getTimeStamp();
      this.containerEl.classList.remove(Runner.classes.CRASHED);
      this.clearCanvas();
      this.distanceMeter.reset(this.highestScore);
      this.horizon.reset();
      this.tRex.reset();
      this.playSound(this.soundFx.BUTTON_PRESS);
      this.invert(true);
      this.update();
    }
  }

  /**
   * Whether the game should go into arcade mode.
   * @return {boolean}
   */
  isArcadeMode() {
    return document.title == flags.arcadeModeURL;
  }

  /**
   * Hides offline messaging for a fullscreen game only experience.
   */
  setArcadeMode() {
    document.body.classList.add(Runner.classes.ARCADE_MODE);
    this.setArcadeModeContainerScale();
  }

  /**
   * Sets the scaling for arcade mode.
   */
  setArcadeModeContainerScale() {
    var windowHeight = window.innerHeight;
    var scaleHeight = windowHeight / this.dimensions.HEIGHT;
    var scaleWidth = window.innerWidth / this.dimensions.WIDTH;
    var scale = Math.max(1, Math.min(scaleHeight, scaleWidth));
    var scaledCanvasHeight = this.dimensions.HEIGHT * scale;
    // Positions the game container at 10% of the available vertical window
    // height minus the game container height.
    var translateY = Math.ceil(
      Math.max(
        0,
        (windowHeight -
          scaledCanvasHeight -
          Runner.config.ARCADE_MODE_INITIAL_TOP_POSITION) *
          Runner.config.ARCADE_MODE_TOP_POSITION_PERCENT
      )
    );
    this.containerEl.style.transform =
      "scale(" + scale + ") translateY(" + translateY + "px)";
  }

  /**
   * Pause the game if the tab is not in focus.
   */
  onVisibilityChange(e) {
    if (
      document.hidden ||
      document.webkitHidden ||
      e.type == "blur" ||
      document.visibilityState != "visible"
    ) {
      this.stop();
    } else if (!this.crashed) {
      this.tRex.reset();
      this.play();
    }
  }

  /**
   * Play a sound.
   * @param {SoundBuffer} soundBuffer
   */
  playSound(soundBuffer) {
    if (soundBuffer) {
      var sourceNode = this.audioContext.createBufferSource();
      sourceNode.buffer = soundBuffer;
      sourceNode.connect(this.audioContext.destination);
      sourceNode.start(0);
    }
  }

  /**
   * Inverts the current page / canvas colors.
   * @param {boolean} Whether to reset colors.
   */
  invert(reset) {
    if (reset) {
      document.body.classList.toggle(Runner.classes.INVERTED, false);
      this.invertTimer = 0;
      this.inverted = false;
    } else {
      this.inverted = document.body.classList.toggle(
        Runner.classes.INVERTED,
        this.invertTrigger
      );
    }
  }
}

/**
 * Default game configuration.
 * @enum {number}
 */
Runner.config = {
  ACCELERATION: 0.001,
  BG_CLOUD_SPEED: 0.2,
  BOTTOM_PAD: 10,
  CLEAR_TIME: 3000,
  CLOUD_FREQUENCY: 0.5,
  GAMEOVER_CLEAR_TIME: 750,
  GAP_COEFFICIENT: 0.6,
  GRAVITY: 0.6,
  INITIAL_JUMP_VELOCITY: 12,
  INVERT_FADE_DURATION: 12000,
  INVERT_DISTANCE: 700,
  MAX_BLINK_COUNT: 3,
  MAX_CLOUDS: 6,
  MAX_OBSTACLE_LENGTH: 3,
  MAX_OBSTACLE_DUPLICATION: 2,
  MAX_SPEED: 13,
  MIN_JUMP_HEIGHT: 35,
  MOBILE_SPEED_COEFFICIENT: 1.2,
  RESOURCE_TEMPLATE_ID: "audio-resources",
  SPEED: 6,
  SPEED_DROP_COEFFICIENT: 3,
  ARCADE_MODE_INITIAL_TOP_POSITION: 35,
  ARCADE_MODE_TOP_POSITION_PERCENT: 0.1
};

/**
 * Default dimensions.
 * @enum {string}
 */
Runner.defaultDimensions = {
  WIDTH: flags.defaultWidth,
  HEIGHT: 150
};

/**
 * CSS class names.
 * @enum {string}
 */
Runner.classes = {
  ARCADE_MODE: "arcade-mode",
  CANVAS: "runner-canvas",
  CONTAINER: "runner-container",
  CRASHED: "crashed",
  ICON: "icon",
  INVERTED: "inverted",
  SNACKBAR: "snackbar",
  SNACKBAR_SHOW: "snackbar-show",
  TOUCH_CONTROLLER: "controller"
};

/**
 * Sprite definition layout of the spritesheet.
 * @enum {Object}
 */
Runner.spriteDefinition = {
  LDPI: {
    CACTUS_LARGE: { x: 332, y: 2 },
    CACTUS_SMALL: { x: 228, y: 2 },
    CLOUD: { x: 86, y: 2 },
    HORIZON: { x: 2, y: 54 },
    MOON: { x: 484, y: 2 },
    PTERODACTYL: { x: 134, y: 2 },
    RESTART: { x: 2, y: 2 },
    TEXT_SPRITE: { x: 655, y: 2 },
    TREX: { x: 848, y: 2 },
    STAR: { x: 645, y: 2 }
  },
  HDPI: {
    CACTUS_LARGE: { x: 652, y: 2 },
    CACTUS_SMALL: { x: 446, y: 2 },
    CLOUD: { x: 166, y: 2 },
    HORIZON: { x: 2, y: 104 },
    MOON: { x: 954, y: 2 },
    PTERODACTYL: { x: 260, y: 2 },
    RESTART: { x: 2, y: 2 },
    TEXT_SPRITE: { x: 1294, y: 2 },
    TREX: { x: 1678, y: 2 },
    STAR: { x: 1276, y: 2 }
  }
};

/**
 * Sound FX. Reference to the ID of the audio tag on interstitial page.
 * @enum {string}
 */
Runner.sounds = {
  BUTTON_PRESS: "sound-press",
  HIT: "sound-hit",
  SCORE: "sound-reached"
};

/**
 * Key code mapping.
 * @enum {Object}
 */
Runner.keycodes = {
  JUMP: { "38": 1, "32": 1 }, // Up, spacebar
  DUCK: { "40": 1 }, // Down
  RESTART: { "13": 1 } // Enter
};

/**
 * Runner event names.
 * @enum {string}
 */
Runner.events = {
  ANIM_END: "webkitAnimationEnd",
  CLICK: "click",
  KEYDOWN: "keydown",
  KEYUP: "keyup",
  MOUSEDOWN: "mousedown",
  MOUSEUP: "mouseup",
  RESIZE: "resize",
  TOUCHEND: "touchend",
  TOUCHSTART: "touchstart",
  VISIBILITY: "visibilitychange",
  BLUR: "blur",
  FOCUS: "focus",
  LOAD: "load"
};

export default Runner;
