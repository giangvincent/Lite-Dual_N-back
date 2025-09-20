(function() {
  const { createApp, nextTick } = Vue;

  const STORAGE_KEY = "LiteDualNBack_Vue";
  const SOUND_BASE_PATH = "legacy/snd";
  const MAX_LEVEL = 10;
  const MIN_LEVEL = 1;

  createApp({
    data() {
      return {
        navOpen: false,
        settings: {
          time: 2500,
          clues: 8,
          level: 2,
          soundSet: "Numbers English (USA)",
          feedback: 1
        },
        soundsMap: {
          "Numbers English (USA)": [1, 2, 3, 4, 5, 6, 7, 8],
          "Numbers English (UK)": [1, 2, 3, 4, 5, 6, 7, 8],
          "Numbers German": [1, 2, 3, 4, 5, 6, 7, 8],
          "Numbers Russian": [1, 2, 3, 4, 5, 6, 7, 8],
          "Numbers Italian": [1, 2, 3, 4, 5, 6, 7, 8],
          "Letters English (USA)": ["c", "h", "k", "l", "q", "r", "s", "t"],
          "Letters English (UK)": ["c", "h", "k", "l", "q", "r", "s", "t"],
          "Letters German": ["c", "h", "k", "l", "q", "r", "s", "t"],
          "Letters Russian": ["c", "h", "k", "l", "q", "r", "s", "t"],
          "Letters Italian": ["c", "h", "k", "l", "q", "r", "s", "x"],
          "Shapes English": ["point", "line", "circle", "triangle", "square", "rectangle", "pentagon", "hexagon"],
          "Shapes Italian": ["punto", "linea", "cerchio", "triangolo", "quadrato", "rettangolo", "pentagono", "esagono"]
        },
        playableSounds: [],
        running: false,
        block: [],
        index: -1,
        stimuliRemaining: 24,
        enable: [0, 0],
        score: [0, 0, 0, 0, 0, 0],
        activeTile: null,
        timerId: null,
        flashTimeout: null,
        pressedKeys: Object.create(null),
        todayKey: "",
        history: {},
        showResults: false,
        showChart: false,
        resultsData: {
          positions: { hits: 0, misses: 0, errors: 0 },
          sounds: { hits: 0, misses: 0, errors: 0 },
          message: ""
        },
        feedbackState: {
          visual: "",
          audio: ""
        },
        chartContainerId: "history-chart"
      };
    },

    computed: {
      soundOptions() {
        return Object.keys(this.soundsMap);
      },
      feedbackLabel() {
        return this.settings.feedback === 1 ? "on" : "off";
      },
      progressPercent() {
        const today = this.history[this.todayKey];
        if (!today) return 0;
        const progress = (today.runs / 20) * 100;
        return Math.max(0, Math.min(100, progress));
      },
      buttonClasses() {
        return {
          visual: ["action-button", this.feedbackState.visual ? `feedback-${this.feedbackState.visual}` : ""].filter(Boolean).join(" "),
          audio: ["action-button", this.feedbackState.audio ? `feedback-${this.feedbackState.audio}` : ""].filter(Boolean).join(" ")
        };
      }
    },

    watch: {
      "settings.soundSet": {
        handler() {
          this.updateSounds();
        }
      },
      "settings.clues": {
        handler(value) {
          const coerced = Number(value);
          this.settings.clues = coerced;
          if (!this.running) this.resetStimuliCounter();
        }
      },
      "settings.level": {
        handler(value) {
          let lvl = Math.round(Number(value));
          if (Number.isNaN(lvl)) lvl = MIN_LEVEL;
          lvl = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, lvl));
          if (lvl !== this.settings.level) this.settings.level = lvl;
          if (!this.running) this.resetStimuliCounter();
        }
      },
      "settings.time": {
        handler(value) {
          const val = Number(value);
          if (Number.isNaN(val)) {
            this.settings.time = 2500;
            return;
          }
          this.settings.time = Math.max(2000, Math.min(3000, val));
        }
      }
    },

    mounted() {
      this.todayKey = this.formatDate(new Date());
      this.loadHistory();
      this.ensureTodayEntry();
      this.resetStimuliCounter();
      this.updateSounds();
      window.addEventListener("keydown", this.onKeyDown, { passive: false });
      window.addEventListener("keyup", this.onKeyUp, { passive: true });
    },

    beforeUnmount() {
      this.clearTimers();
      window.removeEventListener("keydown", this.onKeyDown);
      window.removeEventListener("keyup", this.onKeyUp);
    },

    methods: {
      toggleNav() {
        this.navOpen = !this.navOpen;
      },

      toggleGame() {
        if (this.running) {
          this.stopGame();
        } else {
          this.startGame();
        }
      },

      startGame() {
        if (this.running) return;
        this.navOpen = false;
        this.running = true;
        this.ensureTodayEntry();
        this.block = this.makeBlock(this.settings.level, this.calculateStimuli(), this.settings.clues);
        this.index = -1;
        this.enable = [0, 0];
        this.score = [0, 0, 0, 0, 0, 0];
        this.activeTile = null;
        this.stimuliRemaining = this.block.length;
        this.clearTimers();
        this.timerId = setTimeout(() => this.playStep(), this.settings.time / 4);
      },

      stopGame() {
        if (!this.running) return;
        this.running = false;
        this.clearTimers();
        this.resetRoundState();
      },

      resetRoundState() {
        this.index = -1;
        this.enable = [0, 0];
        this.activeTile = null;
        this.score = [0, 0, 0, 0, 0, 0];
        this.resetStimuliCounter();
      },

      clearTimers() {
        if (this.timerId) {
          clearTimeout(this.timerId);
          this.timerId = null;
        }
        if (this.flashTimeout) {
          clearTimeout(this.flashTimeout);
          this.flashTimeout = null;
        }
      },

      playStep() {
        if (!this.running) return;
        this.index += 1;
        if (this.index < this.block.length) {
          this.checkMissingInput("position");
          this.checkMissingInput("sound");
          this.flashPosition();
          this.playSound();
          const remaining = this.block.length - this.index - 1;
          this.stimuliRemaining = remaining >= 0 ? remaining : 0;
          this.enable = [0, 0];
          this.timerId = setTimeout(() => this.playStep(), this.settings.time);
        } else {
          this.endBlock();
        }
      },

      flashPosition() {
        const current = this.block[this.index];
        if (!current) return;
        const code = current[0];
        if (!code) return;
        const tileIndex = this.positionToIndex(code);
        this.activeTile = tileIndex;
        if (this.flashTimeout) clearTimeout(this.flashTimeout);
        this.flashTimeout = setTimeout(() => {
          this.activeTile = null;
        }, this.settings.time / 2);
      },

      playSound() {
        const current = this.block[this.index];
        if (!current) return;
        const soundIdx = current[1] - 1;
        const target = this.playableSounds[soundIdx];
        if (target && typeof target.play === "function") {
          target.play();
        }
      },

      confirmInput(type) {
        const isPosition = type === "position";
        const el = isPosition ? 0 : 1;
        if (!this.running || this.enable[el]) return;
        this.enable[el] = 1;
        const n = this.settings.level;
        const current = this.block[this.index];
        const prev = this.block[this.index - n];
        if (!current || !prev) return;
        const match = current[el] === prev[el];
        if (match) {
          this.score[isPosition ? 0 : 3] += 1;
          this.applyFeedback(type, "right");
        } else {
          this.score[isPosition ? 2 : 5] += 1;
          this.applyFeedback(type, "wrong");
        }
      },

      applyFeedback(type, result) {
        if (this.settings.feedback !== 1) return;
        const key = type === "position" ? "visual" : "audio";
        this.feedbackState[key] = result;
        setTimeout(() => {
          this.feedbackState[key] = "";
        }, this.settings.time / 6);
      },

      checkMissingInput(type) {
        const isPosition = type === "position";
        const el = isPosition ? 0 : 1;
        const n = this.settings.level;
        if (this.index <= n) return;
        const previous = this.block[this.index - 1];
        const compare = this.block[this.index - n - 1];
        if (!previous || !compare) return;
        if (previous[el] === compare[el] && this.enable[el] < 1) {
          this.score[isPosition ? 1 : 4] += 1;
        }
      },

      endBlock() {
        this.running = false;
        this.clearTimers();
        this.activeTile = null;

        const missesPositions = this.settings.clues - this.score[0];
        const missesSounds = this.settings.clues - this.score[3];
        this.score[1] = missesPositions;
        this.score[4] = missesSounds;

        const wrongPositions = missesPositions + this.score[2];
        const wrongSounds = missesSounds + this.score[5];
        const toleratedErrors = Math.floor(this.settings.clues * (1 - 0.8));
        const judgement = this.judgeResults(wrongPositions, wrongSounds, toleratedErrors);

        const currentLevel = this.settings.level;
        let message = "";

        if (judgement === 2) {
          this.recordRun(true, currentLevel);
          if (currentLevel < MAX_LEVEL) {
            this.settings.level = currentLevel + 1;
            message = `N is now: ${this.settings.level}`;
          } else {
            message = `N stays: ${currentLevel} (max level reached)`;
          }
        } else if (judgement === 1) {
          this.recordRun(true, currentLevel);
          message = `N stays: ${currentLevel}. Keep trying!`;
        } else if (judgement === 0) {
          this.recordRun(false);
          const nextLevel = Math.max(MIN_LEVEL, currentLevel - 1);
          this.settings.level = nextLevel;
          message = `N is now: ${nextLevel}. Level not saved.`;
        } else {
          this.recordRun(false);
          this.settings.level = MIN_LEVEL;
          message = "N stays: 1. Level not saved. Keep trying.";
        }

        this.resetStimuliCounter();

        this.resultsData = {
          positions: {
            hits: this.score[0],
            misses: this.score[1],
            errors: this.score[2]
          },
          sounds: {
            hits: this.score[3],
            misses: this.score[4],
            errors: this.score[5]
          },
          message
        };

        this.showResults = true;
      },

      openChart() {
        const series = this.collectSeries();
        if (series.avgs.length === 0) {
          window.alert("There are insufficient data to construct the graph.");
          return;
        }
        this.showChart = true;
        nextTick(() => {
          this.renderChart(series);
        });
      },

      closeChart() {
        this.showChart = false;
      },

      closeResults() {
        this.showResults = false;
      },

      collectSeries() {
        const maxs = [];
        const avgs = [];
        const mins = [];
        Object.values(this.history).forEach(day => {
          if (Array.isArray(day.data) && day.data.length > 0) {
            maxs.push(this.arrayMax(day.data));
            avgs.push(this.arrayAvg(day.data));
            mins.push(this.arrayMin(day.data));
          }
        });
        return { maxs, avgs, mins };
      },

      renderChart(series) {
        if (typeof Chartist === "undefined") return;
        new Chartist.Line(`#${this.chartContainerId}`, {
          series: [series.maxs, series.avgs, series.mins]
        }, {
          fullWidth: true,
          axisX: {
            onlyInteger: true
          },
          axisY: {
            onlyInteger: true,
            high: 9,
            low: 1,
            ticks: [1, 2, 3, 4, 5, 6, 7, 8, 9]
          },
          chartPadding: {
            top: 40,
            right: 40
          }
        });
      },

      calculateStimuli() {
        return this.settings.clues * (this.settings.level + 1);
      },

      resetStimuliCounter() {
        this.stimuliRemaining = this.calculateStimuli();
      },

      updateSounds() {
        const folder = this.settings.soundSet;
        const selection = this.soundsMap[folder];
        if (!selection) {
          this.playableSounds = [];
          return;
        }
        this.playableSounds = selection.map(name => {
          const fileName = `${SOUND_BASE_PATH}/${folder}/${name}.mp3`;
          return new Howl({ src: [fileName] });
        });
      },

      makeBlock(n, stimuli, clues) {
        if (stimuli <= 0) return [];
        let block;
        do {
          block = this.prepareBlock(n, stimuli, clues);
        } while (!this.isValidBlock(block, n, clues));
        return block;
      },

      prepareBlock(n, stimuli, clues) {
        const block = Array.from({ length: stimuli }, () => [0, 0]);

        const randomStimulus = () => 1 + Math.floor(Math.random() * 8);

        const introduceMatches = (type) => {
          const el = type === "positions" ? 0 : 1;
          let amount = 0;
          while (amount < clues) {
            const target = Math.floor(Math.random() * block.length);
            if (!block[target + n]) continue;
            const current = block[target][el];
            const future = block[target + n][el];
            if (current === 0 && future === 0) {
              const stim = randomStimulus();
              block[target][el] = stim;
              block[target + n][el] = stim;
              amount++;
            } else if (current !== 0 && future === 0) {
              block[target + n][el] = block[target][el];
              amount++;
            } else if (current === 0 && future !== 0) {
              block[target][el] = block[target + n][el];
              amount++;
            }
          }
        };

        const fillHole = (type, idx) => {
          const el = type === "position" ? 0 : 1;
          if (block[idx][el] === 0) {
            block[idx][el] = randomStimulus();
            if (block[idx - n] && block[idx][el] === block[idx - n][el]) {
              block[idx][el] = block[idx][el] < 8 ? block[idx][el] + 1 : block[idx][el] - 1;
            } else if (block[idx + n] && block[idx][el] === block[idx + n][el]) {
              block[idx][el] = block[idx][el] < 8 ? block[idx][el] + 1 : block[idx][el] - 1;
            }
          }
        };

        introduceMatches("positions");
        introduceMatches("sounds");

        for (let i = 0; i < block.length; i++) {
          fillHole("position", i);
          fillHole("sound", i);
        }

        return block;
      },

      isValidBlock(block, n, clues) {
        let positions = 0;
        let sounds = 0;
        for (let i = 0; i < block.length; i++) {
          if (block[i - n]) {
            if (block[i][0] === block[i - n][0]) positions++;
            if (block[i][1] === block[i - n][1]) sounds++;
          }
        }
        return positions === sounds && positions === clues;
      },

      judgeResults(wrongPositions, wrongSounds, toleratedErrors) {
        if (wrongPositions <= toleratedErrors && wrongSounds <= toleratedErrors) {
          return 2;
        }
        if (wrongPositions <= toleratedErrors + 2 || wrongSounds <= toleratedErrors + 2) {
          return 1;
        }
        if (this.settings.level !== MIN_LEVEL) {
          return 0;
        }
        return -1;
      },

      positionToIndex(value) {
        if (value < 5) return value - 1;
        return value;
      },

      tileClasses(index) {
        const classes = ["grid-cell"];
        if (index === 4) classes.push("center");
        if (this.activeTile === index) classes.push("active");
        return classes.join(" ");
      },

      onKeyDown(event) {
        const key = event.key ? event.key.toLowerCase() : "";
        if (!key) return;
        if (this.pressedKeys[key]) return;
        if (["a", "l", "s"].includes(key)) {
          event.preventDefault();
        }
        this.pressedKeys[key] = true;
        if (key === "a") {
          this.confirmInput("position");
        } else if (key === "l") {
          this.confirmInput("sound");
        } else if (key === "s") {
          this.toggleGame();
        }
      },

      onKeyUp(event) {
        const key = event.key ? event.key.toLowerCase() : "";
        if (!key) return;
        this.pressedKeys[key] = false;
      },

      formatDate(date) {
        const dd = String(date.getDate()).padStart(2, "0");
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const yyyy = date.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
      },

      loadHistory() {
        try {
          const raw = window.localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") {
              this.history = parsed;
            }
          }
        } catch (err) {
          console.warn("Unable to load saved history", err);
          this.history = {};
        }
      },

      saveHistory() {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.history));
        } catch (err) {
          console.warn("Unable to persist history", err);
        }
      },

      ensureTodayEntry() {
        if (!this.history[this.todayKey]) {
          this.history[this.todayKey] = { runs: 0, data: [] };
          this.saveHistory();
        }
      },

      recordRun(saveLevel, levelValue) {
        this.ensureTodayEntry();
        const today = this.history[this.todayKey];
        today.runs += 1;
        if (saveLevel === true && typeof levelValue === "number") {
          today.data.push(levelValue);
        }
        this.saveHistory();
      },

      arrayMax(arr) {
        return arr.reduce((acc, curr) => Math.max(acc, curr));
      },

      arrayMin(arr) {
        return arr.reduce((acc, curr) => Math.min(acc, curr));
      },

      arrayAvg(arr) {
        if (arr.length === 0) return 0;
        const sum = arr.reduce((acc, curr) => acc + curr, 0);
        return sum / arr.length;
      }
    }
  }).mount("#app");
})();
