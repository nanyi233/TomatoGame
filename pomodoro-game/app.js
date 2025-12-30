/**
 * Pomodoro Timer Game Application
 * A gamified productivity tool with achievements, stats, and customization
 */

// ===== Configuration =====
const DEFAULT_CONFIG = {
    workDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    longBreakInterval: 4,
    dailyGoal: 8,
    tickSound: false,
    notifSound: true,
    ambientSound: false,
    volume: 50,
    desktopNotif: true,
    autoStart: false,
    theme: 'default'
};

// ===== Achievements Definition =====
const ACHIEVEMENTS = [
    { id: 'first_tomato', name: '第一个番茄', desc: '完成你的第一个番茄', icon: '🍅', condition: (s) => s.totalPomodoros >= 1 },
    { id: 'five_streak', name: '五连击', desc: '连续完成5个番茄', icon: '🔥', condition: (s) => s.maxStreak >= 5 },
    { id: 'ten_streak', name: '十连击大师', desc: '连续完成10个番茄', icon: '💥', condition: (s) => s.maxStreak >= 10 },
    { id: 'daily_hero', name: '日常英雄', desc: '一天完成8个番茄', icon: '🦸', condition: (s) => s.bestDay >= 8 },
    { id: 'super_focus', name: '超级专注', desc: '一天完成12个番茄', icon: '🧠', condition: (s) => s.bestDay >= 12 },
    { id: 'century', name: '百番达成', desc: '累计完成100个番茄', icon: '💯', condition: (s) => s.totalPomodoros >= 100 },
    { id: 'task_master', name: '任务大师', desc: '完成10个任务', icon: '✅', condition: (s) => s.totalTasks >= 10 },
    { id: 'week_warrior', name: '周战士', desc: '连续7天使用番茄钟', icon: '🗓️', condition: (s) => s.consecutiveDays >= 7 },
    { id: 'early_bird', name: '早起鸟', desc: '在早上6点前开始番茄', icon: '🐦', condition: (s) => s.earlyBird },
    { id: 'night_owl', name: '夜猫子', desc: '在凌晨12点后完成番茄', icon: '🦉', condition: (s) => s.nightOwl },
    { id: 'marathon', name: '马拉松', desc: '累计专注时间超过24小时', icon: '🏃', condition: (s) => s.totalMinutes >= 1440 },
    { id: 'legend', name: '传奇', desc: '累计完成500个番茄', icon: '👑', condition: (s) => s.totalPomodoros >= 500 }
];

// ===== Application State =====
class AppState {
    constructor() {
        this.config = { ...DEFAULT_CONFIG };
        this.tasks = [];
        this.stats = {
            totalPomodoros: 0,
            totalMinutes: 0,
            totalTasks: 0,
            currentStreak: 0,
            maxStreak: 0,
            bestDay: 0,
            consecutiveDays: 0,
            lastActiveDate: null,
            earlyBird: false,
            nightOwl: false,
            unlockedAchievements: [],
            dailyRecords: {},
            hourlyDistribution: Array(24).fill(0)
        };
        this.timer = {
            mode: 'work', // work, shortBreak, longBreak
            timeRemaining: 25 * 60,
            totalTime: 25 * 60,
            isRunning: false,
            sessionsCompleted: 0
        };
        this.currentTaskId = null;
        this.load();
    }

    save() {
        localStorage.setItem('pomodoro_config', JSON.stringify(this.config));
        localStorage.setItem('pomodoro_tasks', JSON.stringify(this.tasks));
        localStorage.setItem('pomodoro_stats', JSON.stringify(this.stats));
    }

    load() {
        try {
            const config = localStorage.getItem('pomodoro_config');
            const tasks = localStorage.getItem('pomodoro_tasks');
            const stats = localStorage.getItem('pomodoro_stats');
            
            if (config) this.config = { ...DEFAULT_CONFIG, ...JSON.parse(config) };
            if (tasks) this.tasks = JSON.parse(tasks);
            if (stats) this.stats = { ...this.stats, ...JSON.parse(stats) };
            
            this.timer.totalTime = this.config.workDuration * 60;
            this.timer.timeRemaining = this.timer.totalTime;
        } catch (e) {
            console.error('Error loading data:', e);
        }
    }

    getTodayKey() {
        return new Date().toISOString().split('T')[0];
    }

    getTodayStats() {
        const today = this.getTodayKey();
        return this.stats.dailyRecords[today] || { pomodoros: 0, minutes: 0, tasks: 0 };
    }

    updateDailyStats(pomodoros = 0, minutes = 0, tasks = 0) {
        const today = this.getTodayKey();
        if (!this.stats.dailyRecords[today]) {
            this.stats.dailyRecords[today] = { pomodoros: 0, minutes: 0, tasks: 0 };
        }
        this.stats.dailyRecords[today].pomodoros += pomodoros;
        this.stats.dailyRecords[today].minutes += minutes;
        this.stats.dailyRecords[today].tasks += tasks;
        
        // Update best day
        if (this.stats.dailyRecords[today].pomodoros > this.stats.bestDay) {
            this.stats.bestDay = this.stats.dailyRecords[today].pomodoros;
        }
        
        this.save();
    }
}

// ===== Timer Module =====
class TimerModule {
    constructor(state, ui, audio) {
        this.state = state;
        this.ui = ui;
        this.audio = audio;
        this.intervalId = null;
        this.lastTickTime = null;
        
        this.handleVisibilityChange();
    }

    start() {
        if (this.state.timer.isRunning) return;
        
        this.state.timer.isRunning = true;
        this.lastTickTime = Date.now();
        
        // Check early bird achievement
        const hour = new Date().getHours();
        if (hour < 6) {
            this.state.stats.earlyBird = true;
        }
        
        this.intervalId = setInterval(() => this.tick(), 100);
        this.ui.updateTimerControls(true);
        
        if (this.state.config.tickSound) {
            this.audio.startTickSound();
        }
    }

    pause() {
        if (!this.state.timer.isRunning) return;
        
        this.state.timer.isRunning = false;
        clearInterval(this.intervalId);
        this.intervalId = null;
        this.ui.updateTimerControls(false);
        this.audio.stopTickSound();
    }

    reset() {
        this.pause();
        this.state.timer.mode = 'work';
        this.state.timer.totalTime = this.state.config.workDuration * 60;
        this.state.timer.timeRemaining = this.state.timer.totalTime;
        this.ui.updateTimerDisplay();
        this.ui.updateTimerMode('work');
    }

    skip() {
        this.pause();
        this.completeSession(true);
    }

    tick() {
        const now = Date.now();
        const delta = (now - this.lastTickTime) / 1000;
        this.lastTickTime = now;
        
        this.state.timer.timeRemaining -= delta;
        
        if (this.state.timer.timeRemaining <= 0) {
            this.completeSession();
        }
        
        this.ui.updateTimerDisplay();
    }

    completeSession(skipped = false) {
        this.pause();
        
        const isWorkSession = this.state.timer.mode === 'work';
        
        if (isWorkSession && !skipped) {
            // Complete work session
            this.state.timer.sessionsCompleted++;
            this.state.stats.totalPomodoros++;
            this.state.stats.currentStreak++;
            this.state.stats.totalMinutes += this.state.config.workDuration;
            
            // Update hourly distribution
            const hour = new Date().getHours();
            this.state.stats.hourlyDistribution[hour]++;
            
            // Check night owl achievement
            if (hour >= 0 && hour < 5) {
                this.state.stats.nightOwl = true;
            }
            
            // Update max streak
            if (this.state.stats.currentStreak > this.state.stats.maxStreak) {
                this.state.stats.maxStreak = this.state.stats.currentStreak;
            }
            
            // Update daily stats
            this.state.updateDailyStats(1, this.state.config.workDuration, 0);
            
            // Update current task if exists
            if (this.state.currentTaskId) {
                const task = this.state.tasks.find(t => t.id === this.state.currentTaskId);
                if (task) {
                    task.completedPomodoros++;
                    this.state.save();
                }
            }
            
            // Check achievements
            this.checkAchievements();
            
            // Show celebration
            this.ui.showCelebration();
            this.audio.playCompleteSound();
            
            // Show notification
            this.showNotification('🍅 番茄完成！', `你已完成 ${this.state.stats.currentStreak} 个连续番茄！`);
            
            this.ui.showToast('success', `🍅 太棒了！完成第 ${this.state.timer.sessionsCompleted} 个番茄！`);
        }
        
        // Determine next session
        this.nextSession();
        
        this.state.save();
        this.ui.updateStats();
    }

    nextSession() {
        const { sessionsCompleted } = this.state.timer;
        const { longBreakInterval, workDuration, shortBreakDuration, longBreakDuration } = this.state.config;
        
        if (this.state.timer.mode === 'work') {
            // Switch to break
            if (sessionsCompleted % longBreakInterval === 0 && sessionsCompleted > 0) {
                this.state.timer.mode = 'longBreak';
                this.state.timer.totalTime = longBreakDuration * 60;
                this.ui.showToast('info', '🎉 休息一下吧！你值得一个长休息！');
            } else {
                this.state.timer.mode = 'shortBreak';
                this.state.timer.totalTime = shortBreakDuration * 60;
                this.ui.showToast('info', '☕ 短暂休息，保持状态！');
            }
        } else {
            // Switch to work
            this.state.timer.mode = 'work';
            this.state.timer.totalTime = workDuration * 60;
            
            if (this.state.config.autoStart) {
                setTimeout(() => this.start(), 1000);
            } else {
                this.ui.showToast('info', '💪 准备好了吗？开始新的番茄！');
            }
        }
        
        this.state.timer.timeRemaining = this.state.timer.totalTime;
        this.ui.updateTimerDisplay();
        this.ui.updateTimerMode(this.state.timer.mode);
        
        if (this.state.timer.mode !== 'work') {
            this.audio.playBreakSound();
            this.showNotification('⏰ 休息时间！', this.state.timer.mode === 'longBreak' ? '享受长休息！' : '短暂休息一下！');
        }
    }

    checkAchievements() {
        ACHIEVEMENTS.forEach(achievement => {
            if (!this.state.stats.unlockedAchievements.includes(achievement.id)) {
                if (achievement.condition(this.state.stats)) {
                    this.state.stats.unlockedAchievements.push(achievement.id);
                    this.ui.showAchievementUnlock(achievement);
                    this.audio.playAchievementSound();
                }
            }
        });
    }

    showNotification(title, body) {
        if (!this.state.config.desktopNotif) return;
        
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body,
                icon: '🍅',
                badge: '🍅',
                tag: 'pomodoro'
            });
        }
    }

    handleVisibilityChange() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.state.timer.isRunning) {
                // Page is hidden, keep timer accurate
                this.lastTickTime = Date.now();
            } else if (!document.hidden && this.state.timer.isRunning) {
                // Page is visible again, update display immediately
                this.ui.updateTimerDisplay();
            }
        });
    }
}

// ===== Task Module =====
class TaskModule {
    constructor(state, ui) {
        this.state = state;
        this.ui = ui;
    }

    addTask(name, estimatedPomodoros = 1) {
        const task = {
            id: Date.now().toString(),
            name,
            estimatedPomodoros,
            completedPomodoros: 0,
            completed: false,
            createdAt: new Date().toISOString()
        };
        
        this.state.tasks.unshift(task);
        this.state.save();
        this.ui.renderTasks();
        this.ui.showToast('success', '✅ 任务已添加！');
        
        return task;
    }

    deleteTask(taskId) {
        this.state.tasks = this.state.tasks.filter(t => t.id !== taskId);
        
        if (this.state.currentTaskId === taskId) {
            this.state.currentTaskId = null;
            this.ui.updateCurrentTask(null);
        }
        
        this.state.save();
        this.ui.renderTasks();
    }

    toggleComplete(taskId) {
        const task = this.state.tasks.find(t => t.id === taskId);
        if (task) {
            task.completed = !task.completed;
            
            if (task.completed) {
                this.state.stats.totalTasks++;
                this.state.updateDailyStats(0, 0, 1);
                this.ui.showToast('success', '🎉 任务完成！');
            }
            
            this.state.save();
            this.ui.renderTasks();
            this.ui.updateStats();
        }
    }

    selectTask(taskId) {
        this.state.currentTaskId = taskId;
        const task = this.state.tasks.find(t => t.id === taskId);
        this.ui.updateCurrentTask(task);
        this.ui.renderTasks();
    }
}

// ===== Audio Module =====
class AudioModule {
    constructor(state) {
        this.state = state;
        this.audioContext = null;
        this.tickInterval = null;
        this.volume = state.config.volume / 100;
        
        this.initAudioContext();
    }

    initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }

    setVolume(vol) {
        this.volume = vol / 100;
        this.state.config.volume = vol;
        this.state.save();
    }

    playTone(frequency, duration, type = 'sine') {
        if (!this.audioContext || this.volume === 0) return;
        
        // Resume context if suspended
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.type = type;
        oscillator.frequency.value = frequency;
        
        gainNode.gain.setValueAtTime(this.volume * 0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
        
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + duration);
    }

    startTickSound() {
        if (!this.state.config.tickSound) return;
        
        this.tickInterval = setInterval(() => {
            this.playTone(800, 0.05, 'square');
        }, 1000);
    }

    stopTickSound() {
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
    }

    playCompleteSound() {
        if (!this.state.config.notifSound) return;
        
        // Play a pleasant completion melody
        setTimeout(() => this.playTone(523.25, 0.2), 0);
        setTimeout(() => this.playTone(659.25, 0.2), 150);
        setTimeout(() => this.playTone(783.99, 0.3), 300);
    }

    playBreakSound() {
        if (!this.state.config.notifSound) return;
        
        // Gentle notification for break
        setTimeout(() => this.playTone(440, 0.3), 0);
        setTimeout(() => this.playTone(554.37, 0.4), 200);
    }

    playAchievementSound() {
        if (!this.state.config.notifSound) return;
        
        // Triumphant achievement sound
        setTimeout(() => this.playTone(523.25, 0.15), 0);
        setTimeout(() => this.playTone(659.25, 0.15), 100);
        setTimeout(() => this.playTone(783.99, 0.15), 200);
        setTimeout(() => this.playTone(1046.50, 0.4), 300);
    }
}

// ===== UI Module =====
class UIModule {
    constructor(state) {
        this.state = state;
        this.elements = {};
        this.cacheElements();
    }

    cacheElements() {
        this.elements = {
            // Timer
            timerDisplay: document.getElementById('timerDisplay'),
            timerProgress: document.getElementById('timerProgress'),
            timerMode: document.getElementById('timerMode'),
            sessionCount: document.getElementById('sessionCount'),
            startBtn: document.getElementById('startBtn'),
            resetBtn: document.getElementById('resetBtn'),
            skipBtn: document.getElementById('skipBtn'),
            playIcon: document.querySelector('.play-icon'),
            pauseIcon: document.querySelector('.pause-icon'),
            
            // Current task
            currentTaskName: document.getElementById('currentTaskName'),
            
            // Tasks
            taskList: document.getElementById('taskList'),
            taskInputContainer: document.getElementById('taskInputContainer'),
            taskInput: document.getElementById('taskInput'),
            taskPomodoros: document.getElementById('taskPomodoros'),
            addTaskBtn: document.getElementById('addTaskBtn'),
            saveTaskBtn: document.getElementById('saveTaskBtn'),
            cancelTaskBtn: document.getElementById('cancelTaskBtn'),
            
            // Stats display
            currentStreak: document.getElementById('currentStreak'),
            totalPomodoros: document.getElementById('totalPomodoros'),
            achievementCount: document.getElementById('achievementCount'),
            dailyProgress: document.getElementById('dailyProgress'),
            dailyGoal: document.getElementById('dailyGoal'),
            dailyProgressBar: document.getElementById('dailyProgressBar'),
            todayFocusTime: document.getElementById('todayFocusTime'),
            todayPomodoros: document.getElementById('todayPomodoros'),
            todayTasks: document.getElementById('todayTasks'),
            
            // Audio controls
            tickSoundBtn: document.getElementById('tickSoundBtn'),
            notifSoundBtn: document.getElementById('notifSoundBtn'),
            ambientBtn: document.getElementById('ambientBtn'),
            volumeSlider: document.getElementById('volumeSlider'),
            
            // Modals
            settingsModal: document.getElementById('settingsModal'),
            statsModal: document.getElementById('statsModal'),
            settingsBtn: document.getElementById('settingsBtn'),
            statsBtn: document.getElementById('statsBtn'),
            closeSettings: document.getElementById('closeSettings'),
            closeStats: document.getElementById('closeStats'),
            themeBtn: document.getElementById('themeBtn'),
            
            // Settings inputs
            workDuration: document.getElementById('workDuration'),
            shortBreakDuration: document.getElementById('shortBreakDuration'),
            longBreakDuration: document.getElementById('longBreakDuration'),
            longBreakInterval: document.getElementById('longBreakInterval'),
            dailyGoalSetting: document.getElementById('dailyGoalSetting'),
            desktopNotif: document.getElementById('desktopNotif'),
            autoStart: document.getElementById('autoStart'),
            exportDataBtn: document.getElementById('exportDataBtn'),
            clearDataBtn: document.getElementById('clearDataBtn'),
            
            // Celebration
            celebrationContainer: document.getElementById('celebrationContainer'),
            toastContainer: document.getElementById('toastContainer'),
            
            // Stats
            recentAchievements: document.getElementById('recentAchievements'),
            achievementsGrid: document.getElementById('achievementsGrid'),
            heatmap: document.getElementById('heatmap'),
            dailyChart: document.getElementById('dailyChart'),
            weeklyChart: document.getElementById('weeklyChart')
        };
    }

    init() {
        this.updateTimerDisplay();
        this.updateStats();
        this.renderTasks();
        this.loadSettings();
        this.updateTheme(this.state.config.theme);
        this.updateAudioButtons();
    }

    // Timer UI
    updateTimerDisplay() {
        const { timeRemaining, totalTime } = this.state.timer;
        
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = Math.floor(timeRemaining % 60);
        
        this.elements.timerDisplay.textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Update progress ring
        const circumference = 2 * Math.PI * 90;
        const progress = timeRemaining / totalTime;
        const offset = circumference * (1 - progress);
        this.elements.timerProgress.style.strokeDashoffset = offset;
        
        // Update page title
        document.title = `${this.elements.timerDisplay.textContent} - 番茄工作法`;
        
        // Update session count
        this.elements.sessionCount.textContent = this.state.timer.sessionsCompleted;
    }

    updateTimerControls(isRunning) {
        if (isRunning) {
            this.elements.playIcon.classList.add('hidden');
            this.elements.pauseIcon.classList.remove('hidden');
        } else {
            this.elements.playIcon.classList.remove('hidden');
            this.elements.pauseIcon.classList.add('hidden');
        }
    }

    updateTimerMode(mode) {
        const modeNames = {
            work: '工作时间',
            shortBreak: '短休息',
            longBreak: '长休息'
        };
        
        this.elements.timerMode.textContent = modeNames[mode];
        
        if (mode === 'work') {
            this.elements.timerProgress.classList.remove('break');
        } else {
            this.elements.timerProgress.classList.add('break');
        }
    }

    // Task UI
    renderTasks() {
        const tasks = this.state.tasks;
        
        if (tasks.length === 0) {
            this.elements.taskList.innerHTML = `
                <li class="task-empty">
                    <p>还没有任务</p>
                    <p>点击 + 添加新任务</p>
                </li>
            `;
            return;
        }
        
        this.elements.taskList.innerHTML = tasks.map(task => `
            <li class="task-item ${task.completed ? 'completed' : ''} ${task.id === this.state.currentTaskId ? 'active' : ''}" 
                data-id="${task.id}">
                <div class="task-checkbox ${task.completed ? 'checked' : ''}" data-action="toggle"></div>
                <div class="task-info" data-action="select">
                    <div class="task-name">${this.escapeHtml(task.name)}</div>
                    <div class="task-pomodoros">🍅 ${task.completedPomodoros}/${task.estimatedPomodoros}</div>
                </div>
                <div class="task-actions">
                    <button class="task-action-btn" data-action="delete" title="删除">
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>
                </div>
            </li>
        `).join('');
    }

    updateCurrentTask(task) {
        if (task) {
            this.elements.currentTaskName.textContent = task.name;
        } else {
            this.elements.currentTaskName.textContent = '选择一个任务开始';
        }
    }

    toggleTaskInput(show) {
        if (show) {
            this.elements.taskInputContainer.classList.add('active');
            this.elements.taskInput.focus();
        } else {
            this.elements.taskInputContainer.classList.remove('active');
            this.elements.taskInput.value = '';
            this.elements.taskPomodoros.value = 1;
        }
    }

    // Stats UI
    updateStats() {
        const { stats, config } = this.state;
        const todayStats = this.state.getTodayStats();
        
        // Main stats
        this.elements.currentStreak.textContent = stats.currentStreak;
        this.elements.totalPomodoros.textContent = stats.totalPomodoros;
        this.elements.achievementCount.textContent = stats.unlockedAchievements.length;
        
        // Daily progress
        this.elements.dailyProgress.textContent = todayStats.pomodoros;
        this.elements.dailyGoal.textContent = config.dailyGoal;
        const progressPercent = Math.min((todayStats.pomodoros / config.dailyGoal) * 100, 100);
        this.elements.dailyProgressBar.style.width = `${progressPercent}%`;
        
        // Today's stats in right panel
        this.elements.todayFocusTime.textContent = `${todayStats.minutes}分钟`;
        this.elements.todayPomodoros.textContent = `${todayStats.pomodoros}个`;
        this.elements.todayTasks.textContent = `${todayStats.tasks}个`;
        
        // Update recent achievements
        this.updateRecentAchievements();
    }

    updateRecentAchievements() {
        const unlocked = this.state.stats.unlockedAchievements;
        
        if (unlocked.length === 0) {
            this.elements.recentAchievements.innerHTML = `
                <div class="achievement-placeholder">完成番茄解锁成就!</div>
            `;
            return;
        }
        
        const recent = unlocked.slice(-3).reverse();
        this.elements.recentAchievements.innerHTML = recent.map(id => {
            const achievement = ACHIEVEMENTS.find(a => a.id === id);
            return `
                <div class="achievement-item">
                    <span class="achievement-icon">${achievement.icon}</span>
                    <div class="achievement-info">
                        <div class="achievement-name">${achievement.name}</div>
                        <div class="achievement-desc">${achievement.desc}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Settings UI
    loadSettings() {
        const { config } = this.state;
        
        this.elements.workDuration.value = config.workDuration;
        this.elements.shortBreakDuration.value = config.shortBreakDuration;
        this.elements.longBreakDuration.value = config.longBreakDuration;
        this.elements.longBreakInterval.value = config.longBreakInterval;
        this.elements.dailyGoalSetting.value = config.dailyGoal;
        this.elements.desktopNotif.checked = config.desktopNotif;
        this.elements.autoStart.checked = config.autoStart;
        this.elements.volumeSlider.value = config.volume;
        
        // Update theme buttons
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === config.theme);
        });
    }

    saveSettings() {
        const config = this.state.config;
        
        config.workDuration = parseInt(this.elements.workDuration.value) || 25;
        config.shortBreakDuration = parseInt(this.elements.shortBreakDuration.value) || 5;
        config.longBreakDuration = parseInt(this.elements.longBreakDuration.value) || 15;
        config.longBreakInterval = parseInt(this.elements.longBreakInterval.value) || 4;
        config.dailyGoal = parseInt(this.elements.dailyGoalSetting.value) || 8;
        config.desktopNotif = this.elements.desktopNotif.checked;
        config.autoStart = this.elements.autoStart.checked;
        
        this.state.save();
        
        // Update timer if not running
        if (!this.state.timer.isRunning && this.state.timer.mode === 'work') {
            this.state.timer.totalTime = config.workDuration * 60;
            this.state.timer.timeRemaining = this.state.timer.totalTime;
            this.updateTimerDisplay();
        }
        
        this.updateStats();
    }

    updateTheme(theme) {
        document.body.dataset.theme = theme;
        this.state.config.theme = theme;
        this.state.save();
        
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });
    }

    updateAudioButtons() {
        const config = this.state.config;
        
        this.elements.tickSoundBtn.classList.toggle('active', config.tickSound);
        this.elements.notifSoundBtn.classList.toggle('active', config.notifSound);
        this.elements.ambientBtn.classList.toggle('active', config.ambientSound);
    }

    // Modals
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.add('active');
        
        if (modalId === 'statsModal') {
            this.renderStatsModal();
        }
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.remove('active');
    }

    renderStatsModal() {
        this.renderAchievementsGrid();
        this.renderHeatmap();
        this.updateStatsModalData();
    }

    renderAchievementsGrid() {
        this.elements.achievementsGrid.innerHTML = ACHIEVEMENTS.map(achievement => {
            const unlocked = this.state.stats.unlockedAchievements.includes(achievement.id);
            return `
                <div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
                    <div class="icon">${achievement.icon}</div>
                    <div class="name">${achievement.name}</div>
                    <div class="desc">${achievement.desc}</div>
                </div>
            `;
        }).join('');
    }

    renderHeatmap() {
        const days = 35; // 5 weeks
        const today = new Date();
        let html = '';
        
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const key = date.toISOString().split('T')[0];
            const record = this.state.stats.dailyRecords[key];
            const count = record ? record.pomodoros : 0;
            
            let level = 0;
            if (count > 0) level = 1;
            if (count >= 4) level = 2;
            if (count >= 8) level = 3;
            if (count >= 12) level = 4;
            if (count >= 16) level = 5;
            
            html += `<div class="heatmap-cell level-${level}" title="${key}: ${count}个番茄"></div>`;
        }
        
        this.elements.heatmap.innerHTML = html;
    }

    updateStatsModalData() {
        const todayStats = this.state.getTodayStats();
        const stats = this.state.stats;
        
        // Today
        document.getElementById('statsTodayPomodoros').textContent = todayStats.pomodoros;
        document.getElementById('statsTodayFocus').textContent = 
            Math.floor(todayStats.minutes / 60) + 'h ' + (todayStats.minutes % 60) + 'm';
        document.getElementById('statsTodayTasks').textContent = todayStats.tasks;
        
        // Week
        const weekStats = this.getWeekStats();
        document.getElementById('statsWeekPomodoros').textContent = weekStats.pomodoros;
        document.getElementById('statsWeekFocus').textContent = Math.floor(weekStats.minutes / 60) + 'h';
        document.getElementById('statsWeekAvg').textContent = (weekStats.pomodoros / 7).toFixed(1);
        
        // Month
        const monthStats = this.getMonthStats();
        document.getElementById('statsMonthPomodoros').textContent = monthStats.pomodoros;
        document.getElementById('statsMonthFocus').textContent = Math.floor(monthStats.minutes / 60) + 'h';
        document.getElementById('statsMonthBest').textContent = stats.bestDay;
    }

    getWeekStats() {
        const records = this.state.stats.dailyRecords;
        const today = new Date();
        let pomodoros = 0, minutes = 0;
        
        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const key = date.toISOString().split('T')[0];
            if (records[key]) {
                pomodoros += records[key].pomodoros;
                minutes += records[key].minutes;
            }
        }
        
        return { pomodoros, minutes };
    }

    getMonthStats() {
        const records = this.state.stats.dailyRecords;
        const today = new Date();
        let pomodoros = 0, minutes = 0;
        
        for (let i = 0; i < 30; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const key = date.toISOString().split('T')[0];
            if (records[key]) {
                pomodoros += records[key].pomodoros;
                minutes += records[key].minutes;
            }
        }
        
        return { pomodoros, minutes };
    }

    // Celebration Effects
    showCelebration() {
        const container = this.elements.celebrationContainer;
        const colors = ['#e74c3c', '#f39c12', '#27ae60', '#3498db', '#9b59b6'];
        
        for (let i = 0; i < 50; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.animationDelay = Math.random() * 0.5 + 's';
            confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
            container.appendChild(confetti);
            
            setTimeout(() => confetti.remove(), 3000);
        }
    }

    showAchievementUnlock(achievement) {
        this.showToast('achievement', `🏆 解锁成就：${achievement.name}！`);
        this.updateRecentAchievements();
    }

    // Toast Notifications
    showToast(type, message) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: '✅',
            error: '❌',
            info: 'ℹ️',
            achievement: '🏆'
        };
        
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || ''}</span>
            <span class="toast-message">${message}</span>
        `;
        
        this.elements.toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Utility
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ===== Stats Module (Charts) =====
class StatsModule {
    constructor(state, ui) {
        this.state = state;
        this.ui = ui;
    }

    renderDailyChart() {
        const canvas = document.getElementById('dailyChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const distribution = this.state.stats.hourlyDistribution;
        
        // Simple bar chart
        const width = canvas.width;
        const height = canvas.height;
        const barWidth = width / 24;
        const maxVal = Math.max(...distribution, 1);
        
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--primary');
        
        distribution.forEach((val, i) => {
            const barHeight = (val / maxVal) * (height - 30);
            ctx.fillRect(i * barWidth + 2, height - barHeight - 20, barWidth - 4, barHeight);
        });
        
        // Labels
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary');
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        [0, 6, 12, 18, 23].forEach(h => {
            ctx.fillText(h + ':00', h * barWidth + barWidth / 2, height - 5);
        });
    }
}

// ===== Main Application =====
class PomodoroApp {
    constructor() {
        this.state = new AppState();
        this.ui = new UIModule(this.state);
        this.audio = new AudioModule(this.state);
        this.timer = new TimerModule(this.state, this.ui, this.audio);
        this.tasks = new TaskModule(this.state, this.ui);
        this.stats = new StatsModule(this.state, this.ui);
        
        this.init();
    }

    init() {
        this.ui.init();
        this.bindEvents();
        this.requestNotificationPermission();
        this.setupKeyboardShortcuts();
    }

    bindEvents() {
        // Timer controls
        this.ui.elements.startBtn.addEventListener('click', () => {
            if (this.state.timer.isRunning) {
                this.timer.pause();
            } else {
                this.timer.start();
            }
        });
        
        this.ui.elements.resetBtn.addEventListener('click', () => this.timer.reset());
        this.ui.elements.skipBtn.addEventListener('click', () => this.timer.skip());
        
        // Task events
        this.ui.elements.addTaskBtn.addEventListener('click', () => {
            this.ui.toggleTaskInput(true);
        });
        
        this.ui.elements.saveTaskBtn.addEventListener('click', () => {
            const name = this.ui.elements.taskInput.value.trim();
            const pomodoros = parseInt(this.ui.elements.taskPomodoros.value) || 1;
            
            if (name) {
                this.tasks.addTask(name, pomodoros);
                this.ui.toggleTaskInput(false);
            }
        });
        
        this.ui.elements.cancelTaskBtn.addEventListener('click', () => {
            this.ui.toggleTaskInput(false);
        });
        
        this.ui.elements.taskInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.ui.elements.saveTaskBtn.click();
            }
        });
        
        // Task list delegation
        this.ui.elements.taskList.addEventListener('click', (e) => {
            const item = e.target.closest('.task-item');
            if (!item) return;
            
            const taskId = item.dataset.id;
            const action = e.target.closest('[data-action]')?.dataset.action;
            
            if (action === 'toggle') {
                this.tasks.toggleComplete(taskId);
            } else if (action === 'delete') {
                this.tasks.deleteTask(taskId);
            } else if (action === 'select') {
                this.tasks.selectTask(taskId);
            }
        });
        
        // Audio controls
        this.ui.elements.tickSoundBtn.addEventListener('click', () => {
            this.state.config.tickSound = !this.state.config.tickSound;
            this.state.save();
            this.ui.updateAudioButtons();
            
            if (this.state.config.tickSound && this.state.timer.isRunning) {
                this.audio.startTickSound();
            } else {
                this.audio.stopTickSound();
            }
        });
        
        this.ui.elements.notifSoundBtn.addEventListener('click', () => {
            this.state.config.notifSound = !this.state.config.notifSound;
            this.state.save();
            this.ui.updateAudioButtons();
        });
        
        this.ui.elements.volumeSlider.addEventListener('input', (e) => {
            this.audio.setVolume(parseInt(e.target.value));
        });
        
        // Modal events
        this.ui.elements.settingsBtn.addEventListener('click', () => {
            this.ui.showModal('settingsModal');
        });
        
        this.ui.elements.statsBtn.addEventListener('click', () => {
            this.ui.showModal('statsModal');
        });
        
        this.ui.elements.closeSettings.addEventListener('click', () => {
            this.ui.saveSettings();
            this.ui.hideModal('settingsModal');
        });
        
        this.ui.elements.closeStats.addEventListener('click', () => {
            this.ui.hideModal('statsModal');
        });
        
        // Theme
        this.ui.elements.themeBtn.addEventListener('click', () => {
            const themes = ['default', 'nature', 'dark', 'ocean'];
            const current = themes.indexOf(this.state.config.theme);
            const next = themes[(current + 1) % themes.length];
            this.ui.updateTheme(next);
        });
        
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.ui.updateTheme(btn.dataset.theme);
            });
        });
        
        // Settings inputs auto-save
        const settingsInputs = [
            'workDuration', 'shortBreakDuration', 'longBreakDuration',
            'longBreakInterval', 'dailyGoalSetting', 'desktopNotif', 'autoStart'
        ];
        
        settingsInputs.forEach(id => {
            const el = this.ui.elements[id];
            if (el) {
                el.addEventListener('change', () => this.ui.saveSettings());
            }
        });
        
        // Data management
        this.ui.elements.exportDataBtn.addEventListener('click', () => {
            this.exportData();
        });
        
        this.ui.elements.clearDataBtn.addEventListener('click', () => {
            if (confirm('确定要清除所有数据吗？此操作不可撤销！')) {
                localStorage.clear();
                location.reload();
            }
        });
        
        // Stats tabs
        document.querySelectorAll('.stats-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.stats-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.stats-panel').forEach(p => p.classList.remove('active'));
                
                tab.classList.add('active');
                document.getElementById(tab.dataset.tab + 'Stats')?.classList.add('active');
                document.getElementById(tab.dataset.tab + 'Panel')?.classList.add('active');
            });
        });
        
        // Close modals on backdrop click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    this.ui.elements.startBtn.click();
                    break;
                case 'KeyR':
                    this.timer.reset();
                    break;
                case 'KeyS':
                    this.timer.skip();
                    break;
                case 'Escape':
                    document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
                    break;
            }
        });
    }

    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    exportData() {
        const data = {
            config: this.state.config,
            tasks: this.state.tasks,
            stats: this.state.stats,
            exportDate: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `pomodoro-data-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.ui.showToast('success', '数据已导出！');
    }
}

// ===== Initialize Application =====
document.addEventListener('DOMContentLoaded', () => {
    window.app = new PomodoroApp();
});
