// audioWorker.js
// Worker script for handling audio scheduling independently from UI

// Event queue for audio events
let scheduledEvents = [];
let lastAudioTime = 0;
const LOOK_AHEAD = 100; // ms - how far ahead to schedule sounds
let audioProcessingInterval = null;
let eventCounter = 0;
let totalProcessed = 0;
let isPlaying = true;
let settings = {
  minTimeBetweenNotes: 15, // ms
  neuronLastFiringTimes: new Map()
};

// Initialize worker
self.onmessage = function(e) {
  const message = e.data;
  
  switch (message.type) {
    case 'init':
      console.log('[AudioWorker] Initialized');
      startAudioProcessor();
      break;
      
    case 'neuronFired':
      // Add firing event to the queue with proper timing
      addEvent({
        id: eventCounter++,
        neuronId: message.neuronId,
        timestamp: message.timestamp,
        weight: message.weight || 0.5,
        speed: message.speed || 0.5,
        hasDC: message.hasDC || false,
        parameters: message.parameters || {}
      });
      break;
      
    case 'pause':
      isPlaying = false;
      if (audioProcessingInterval) {
        clearInterval(audioProcessingInterval);
        audioProcessingInterval = null;
      }
      break;
      
    case 'resume':
      isPlaying = true;
      startAudioProcessor();
      break;
      
    case 'updateSettings':
      settings = { ...settings, ...message.settings };
      break;
      
    case 'flushEvents':
      scheduledEvents = [];
      break;
  }
};

// Start the audio processing loop
function startAudioProcessor() {
  if (audioProcessingInterval) clearInterval(audioProcessingInterval);
  
  audioProcessingInterval = setInterval(() => {
    if (!isPlaying) return;
    processAudioEvents();
  }, 10); // Process events every 10ms for smooth playback
}

// Add an event to the queue
function addEvent(event) {
  // Check if this neuron fired too recently
  const neuronId = event.neuronId;
  const now = performance.now();
  const lastFiringTime = settings.neuronLastFiringTimes.get(neuronId) || 0;
  
  // If the neuron fired too recently, don't schedule another event
  if (now - lastFiringTime < settings.minTimeBetweenNotes && !event.hasDC) {
    return;
  }
  
  // Update last firing time
  settings.neuronLastFiringTimes.set(neuronId, now);
  
  // Add event to queue
  scheduledEvents.push(event);
  scheduledEvents.sort((a, b) => a.timestamp - b.timestamp);
}

// Process audio events from the queue
function processAudioEvents() {
  const now = performance.now();
  
  // Process events that need to be scheduled within the look-ahead window
  while (scheduledEvents.length > 0 && 
         scheduledEvents[0].timestamp <= now + LOOK_AHEAD) {
    
    const event = scheduledEvents.shift();
    totalProcessed++;
    
    // Send event back to main thread for actual sound playback
    self.postMessage({
      type: 'playSound',
      event: event,
      processingTime: performance.now() - now
    });
  }
  
  // Occasionally send stats back to main thread
  if (totalProcessed % 100 === 0) {
    self.postMessage({
      type: 'stats',
      queueLength: scheduledEvents.length,
      totalProcessed: totalProcessed
    });
  }
} 