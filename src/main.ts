import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { iceServers } from './net/relay';

// No zooming on a double tap: the viewport and touch-action ask for that,
// but some phone browsers still zoom on the double click a double tap makes.
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
// And no text selection outside text fields, should iOS start one despite
// user-select: none (it can, on a long press).
document.addEventListener('selectstart', e => {
  if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault();
});

// Get relay credentials ready before anyone opens or joins a room.
void iceServers();

export default mount(App, { target: document.getElementById('app')! });
