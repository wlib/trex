// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import Runner from "./runner.js";
import toggleBot from "./bot.js";

const runner = new Runner("#main");

addEventListener("keydown", e => {
  if (e.key === "b") {
    toggleBot(runner);
  }
});
