import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { iceServers } from './net/relay';

// Get relay credentials ready before anyone opens or joins a room.
void iceServers();

export default mount(App, { target: document.getElementById('app')! });
