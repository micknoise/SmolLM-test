// DOM interaction and terminal UI

import { renderMap } from './renderer.js';
import { getCurrentRoom, DIRECTIONS, movePlayer, resolveEncounter } from './game.js';
import { generateRoom } from './generator.js';

const DIR_LABELS = { north: 'N ↑', south: 'S ↓', east: 'E →', west: 'W ←' };

export class UI {
  constructor(state) {
    this.state = state;
    this.onStateChange = null;

    this.$map = document.getElementById('map');
    this.$room = document.getElementById('room-desc');
    this.$encounter = document.getElementById('encounter');
    this.$choices = document.getElementById('choices');
    this.$doors = document.getElementById('doors');
    this.$log = document.getElementById('log');
    this.$stats = document.getElementById('stats');
    this.$loading = document.getElementById('loading-overlay');
  }

  showLoading(text = 'Generating...') {
    if (this.$loading) {
      this.$loading.classList.add('active');
      const msg = this.$loading.querySelector('#loading-msg');
      if (msg) msg.textContent = text;
    }
  }

  hideLoading() {
    if (this.$loading) this.$loading.classList.remove('active');
  }

  addLog(text) {
    this.state.log.push(text);
    if (this.$log) {
      const line = document.createElement('div');
      line.className = 'log-line';
      line.textContent = `> ${text}`;
      this.$log.appendChild(line);
      this.$log.scrollTop = this.$log.scrollHeight;
    }
  }

  render() {
    const { state } = this;
    const room = getCurrentRoom(state);

    // Map
    if (this.$map) {
      this.$map.textContent = renderMap(state).join('\n');
    }

    // Room description
    if (this.$room) {
      this.$room.textContent = room.description || '...';
    }

    // Stats
    if (this.$stats) {
      const m = state.metrics;
      const pf = m.roomsGenerated > 0 ? ((m.parseFailures / m.roomsGenerated) * 100).toFixed(0) : 0;
      this.$stats.innerHTML = `
        <span>HP: <b>${state.player.hp}/${state.player.maxHp}</b></span>
        <span>Gold: <b>${state.player.gold}</b></span>
        <span>Rooms: <b>${m.roomsGenerated}</b></span>
        <span>Turns: <b>${state.turnCount}</b></span>
        <span title="LLM parse fallback rate">Fallback: <b>${pf}%</b></span>
      `;
    }

    // Encounter or doors
    if (room.encounter && !room.encounter.resolved) {
      this.renderEncounter(room);
    } else {
      if (room.encounter && room.encounter.resolved) {
        if (this.$encounter) {
          this.$encounter.textContent = `↳ ${room.encounter.outcomeText}`;
          this.$encounter.className = 'outcome';
        }
      } else {
        if (this.$encounter) this.$encounter.textContent = '';
      }
      if (this.$choices) this.$choices.innerHTML = '';
      this.renderDoors(room);
    }
  }

  renderEncounter(room) {
    if (this.$encounter) {
      this.$encounter.textContent = room.encounter.text;
      this.$encounter.className = 'encounter-text';
    }
    if (this.$choices) {
      this.$choices.innerHTML = '';
      room.encounter.choices.forEach((choice, i) => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.textContent = `${i + 1}. ${choice}`;
        btn.addEventListener('click', () => this.handleChoice(i));
        this.$choices.appendChild(btn);
      });
    }
    if (this.$doors) this.$doors.innerHTML = '';
  }

  renderDoors(room) {
    if (this.$doors) {
      this.$doors.innerHTML = '';
      DIRECTIONS.forEach(dir => {
        if (!room.doors[dir]) return;
        const btn = document.createElement('button');
        btn.className = 'door-btn';
        btn.textContent = DIR_LABELS[dir];
        if (room.doors[dir] === 'pending') {
          btn.classList.add('unexplored');
          btn.title = 'Unexplored passage';
        } else {
          const target = this.state.rooms.get(room.doors[dir]);
          if (target && target.visited) btn.classList.add('visited');
        }
        btn.addEventListener('click', () => this.handleMove(dir));
        this.$doors.appendChild(btn);
      });
    }
  }

  handleChoice(choiceIndex) {
    const outcome = resolveEncounter(this.state, choiceIndex);
    if (outcome) {
      const room = getCurrentRoom(this.state);
      this.addLog(`Choice: "${room.encounter.choices[choiceIndex]}" → ${outcome}`);
    }
    this.render();
    this.onStateChange && this.onStateChange(this.state);
  }

  async handleMove(direction) {
    const room = getCurrentRoom(this.state);

    if (room.doors[direction] === 'pending') {
      this.showLoading('Generating room...');
      try {
        const newRoom = await generateRoom(this.state, this.state.currentRoom, direction);
        movePlayer(this.state, direction);
        this.addLog(`You go ${direction} into a ${newRoom.type}.`);
      } catch (err) {
        console.error(err);
        this.addLog('The passage crumbles — you cannot proceed.');
      } finally {
        this.hideLoading();
      }
    } else if (room.doors[direction]) {
      movePlayer(this.state, direction);
      const newRoom = getCurrentRoom(this.state);
      this.addLog(`You go ${direction}.`);
      if (newRoom.encounter && !newRoom.encounter.resolved) {
        this.addLog(newRoom.encounter.text);
      }
    }

    this.render();
    this.onStateChange && this.onStateChange(this.state);
  }
}
