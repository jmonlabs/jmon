/**
 * jmonTone (Tone Object Notation EXtended) 1.0 - Core Library
 * 
 * A JavaScript library for parsing, validating, and manipulating
 * musical compositions in the jmonTone specification.
 * 
 * Originally designed for Tone.js but extensible to other audio frameworks.
 */

class jmonTone {
    static VERSION = "1.0";
    static FORMAT_IDENTIFIER = "jmonTone";
    
    /**
     * Convert MIDI note number to note name (e.g., 60 -> "C4")
     * @param {number} midiNote - MIDI note number (0-127)
     * @returns {string} Note name (e.g., "C4", "A#3")
     */
    static midiNoteToNoteName(midiNote) {
        if (typeof midiNote !== 'number' || midiNote < 0 || midiNote > 127) {
            console.warn(`Invalid MIDI note number: ${midiNote}. Must be 0-127.`);
            return 'C4'; // Default fallback
        }
        
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midiNote / 12) - 1;
        const noteIndex = midiNote % 12;
        
        return noteNames[noteIndex] + octave;
    }

    /**
     * Convert note name to MIDI note number (e.g., "C4" -> 60)
     * @param {string} noteName - Note name (e.g., "C4", "A#3")
     * @returns {number} MIDI note number (0-127)
     */
    static noteNameToMidiNote(noteName) {
        try {
            // Manual conversion for framework independence
            const noteRegex = /^([A-G])(#|b)?(-?\d+)$/;
            const match = noteName.match(noteRegex);
            
            if (!match) {
                console.warn(`Invalid note name: ${noteName}`);
                return 60; // Default to C4
            }
            
            const [, note, accidental, octave] = match;
            const noteValues = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
            
            let midiNote = noteValues[note] + (parseInt(octave) + 1) * 12;
            
            if (accidental === '#') midiNote += 1;
            else if (accidental === 'b') midiNote -= 1;
            
            return Math.max(0, Math.min(127, midiNote));
        } catch (error) {
            console.warn(`Error converting note name ${noteName}:`, error);
            return 60; // Default to C4
        }
    }

    /**
     * Process note input to handle both MIDI numbers and note names
     * @param {string|number|array} note - Note input
     * @returns {string|array} Processed note(s) as note name(s)
     */
    static processNoteInput(note) {
        if (Array.isArray(note)) {
            return note.map(n => jmonTone.processNoteInput(n));
        } else if (typeof note === 'number') {
            return jmonTone.midiNoteToNoteName(note);
        } else if (typeof note === 'string') {
            return note;
        } else {
            console.warn(`Invalid note input type: ${typeof note}`);
            return 'C4';
        }
    }

    /**
     * Validate a jmonTone composition object against the new schema
     * @param {object} composition - jmonTone composition to validate
     * @returns {object} Validation result with success flag and errors
     */
    static validate(composition) {
        const errors = [];
        const warnings = [];

        // Check required root fields
        if (!composition.format) {
            errors.push("Missing required field: format");
        } else if (composition.format !== jmonTone.FORMAT_IDENTIFIER) {
            errors.push(`Invalid format: expected "${jmonTone.FORMAT_IDENTIFIER}", got "${composition.format}"`);
        }

        if (!composition.version) {
            errors.push("Missing required field: version");
        }

        if (!composition.bpm) {
            errors.push("Missing required field: bpm");
        } else if (typeof composition.bpm !== 'number' || composition.bpm < 20 || composition.bpm > 400) {
            warnings.push("BPM should be between 20-400 according to schema");
        }

        // NEW: Check required audioGraph
        if (!composition.audioGraph || !Array.isArray(composition.audioGraph)) {
            errors.push("Missing required field: audioGraph");
        } else {
            // Validate audioGraph nodes
            composition.audioGraph.forEach((node, index) => {
                if (!node.id) {
                    errors.push(`AudioGraph node ${index}: Missing required field: id`);
                }
                if (!node.type) {
                    errors.push(`AudioGraph node ${index}: Missing required field: type`);
                }
                if (!node.options) {
                    errors.push(`AudioGraph node ${index}: Missing required field: options`);
                }
            });
        }

        // NEW: Check required connections
        if (!composition.connections || !Array.isArray(composition.connections)) {
            errors.push("Missing required field: connections");
        } else {
            // Validate connections format
            composition.connections.forEach((connection, index) => {
                if (!Array.isArray(connection) || connection.length !== 2) {
                    errors.push(`Connection ${index}: Must be an array with exactly 2 elements [source, target]`);
                }
            });
        }

        if (!composition.sequences || !Array.isArray(composition.sequences)) {
            errors.push("Missing or invalid sequences array");
        } else {
            // Validate each sequence
            composition.sequences.forEach((seq, index) => {
                if (!seq.label) {
                    errors.push(`Sequence ${index}: Missing required field: label`);
                }
                if (!seq.synth && !seq.synthRef) {
                    warnings.push(`Sequence ${index}: Missing synth or synthRef definition`);
                }
                if (!seq.notes || !Array.isArray(seq.notes)) {
                    errors.push(`Sequence ${index}: Missing or invalid notes array`);
                } else {
                    // Validate notes
                    seq.notes.forEach((note, noteIndex) => {
                        if (note.time === undefined) {
                            errors.push(`Sequence ${index}, Note ${noteIndex}: Missing required field: time`);
                        }
                        if (!note.note) {
                            errors.push(`Sequence ${index}, Note ${noteIndex}: Missing required field: note`);
                        }
                        if (!note.duration) {
                            errors.push(`Sequence ${index}, Note ${noteIndex}: Missing required field: duration`);
                        }
                        if (note.velocity !== undefined && (note.velocity < 0 || note.velocity > 1)) {
                            warnings.push(`Sequence ${index}, Note ${noteIndex}: Velocity should be between 0.0-1.0`);
                        }
                        // NEW: Validate MIDI channel if present
                        if (note.channel !== undefined && (note.channel < 0 || note.channel > 15)) {
                            errors.push(`Sequence ${index}, Note ${noteIndex}: MIDI channel must be 0-15`);
                        }
                        // NEW: Validate modulations if present
                        if (note.modulations && Array.isArray(note.modulations)) {
                            note.modulations.forEach((mod, modIndex) => {
                                if (!mod.type || !['cc', 'pitchBend', 'aftertouch'].includes(mod.type)) {
                                    errors.push(`Sequence ${index}, Note ${noteIndex}, Modulation ${modIndex}: Invalid type`);
                                }
                                if (mod.value === undefined) {
                                    errors.push(`Sequence ${index}, Note ${noteIndex}, Modulation ${modIndex}: Missing value`);
                                }
                                if (mod.time === undefined) {
                                    errors.push(`Sequence ${index}, Note ${noteIndex}, Modulation ${modIndex}: Missing time`);
                                }
                            });
                        }
                    });
                }
                // NEW: Validate sequence MIDI channel if present
                if (seq.midiChannel !== undefined && (seq.midiChannel < 0 || seq.midiChannel > 15)) {
                    errors.push(`Sequence ${index}: MIDI channel must be 0-15`);
                }
            });
        }

        // NEW: Validate key signature format if present
        if (composition.keySignature && !/^[A-G](#|b)?m?$/.test(composition.keySignature)) {
            errors.push("Invalid keySignature format");
        }

        // NEW: Validate tempo map if present
        if (composition.tempoMap && Array.isArray(composition.tempoMap)) {
            composition.tempoMap.forEach((tempoChange, index) => {
                if (!tempoChange.time) {
                    errors.push(`TempoMap ${index}: Missing time field`);
                }
                if (!tempoChange.bpm || tempoChange.bpm < 20 || tempoChange.bpm > 400) {
                    errors.push(`TempoMap ${index}: Invalid BPM value`);
                }
            });
        }

        return {
            success: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Expand notes with loop repetitions for visualization/export
     * @param {object} sequence - jmonTone sequence object
     * @param {number} totalDuration - Total composition duration in seconds
     * @returns {array} Expanded notes array with loop repetitions
     */
    static expandNotesWithLoop(sequence, totalDuration) {
        const expandedNotes = [...sequence.notes];

        if (sequence.loop && sequence.loop !== false) {
            let loopEndTime;

            if (typeof sequence.loop === 'string') {
                loopEndTime = jmonTone._parseTimeString(sequence.loop, 120);
            } else if (sequence.loop === true) {
                // Calculate from notes
                const lastNoteTime = Math.max(...sequence.notes.map(n => {
                    const noteTime = typeof n.time === 'string' ? jmonTone._parseTimeString(n.time, 120) : n.time;
                    const noteDuration = typeof n.duration === 'string' ? jmonTone._parseTimeString(n.duration, 120) : n.duration;
                    return noteTime + noteDuration;
                }));
                loopEndTime = lastNoteTime;
            }

            const originalDuration = loopEndTime;
            const numberOfLoops = Math.ceil(totalDuration / originalDuration);

            // Add looped notes
            for (let loopIndex = 1; loopIndex < numberOfLoops; loopIndex++) {
                const loopOffset = loopIndex * originalDuration;

                sequence.notes.forEach(originalNote => {
                    const noteTime = typeof originalNote.time === 'string' ? 
                        jmonTone._parseTimeString(originalNote.time, 120) : originalNote.time;
                    
                    const loopedNote = {
                        ...originalNote,
                        time: noteTime + loopOffset,
                        isLooped: true
                    };

                    if (loopedNote.time < totalDuration) {
                        expandedNotes.push(loopedNote);
                    }
                });
            }
        }

        return expandedNotes;
    }

    /**
     * Calculate total composition duration
     * @param {object} composition - jmonTone composition
     * @returns {number} Duration in seconds
     */
    static calculateDuration(composition) {
        let maxDuration = 0;

        composition.sequences.forEach(seq => {
            let sequenceDuration = 0;

            if (seq.loop && seq.loop !== false && typeof seq.loop === 'string') {
                sequenceDuration = jmonTone._parseTimeString(seq.loop, composition.bpm || 120);
            } else {
                // Calculate from notes
                seq.notes.forEach(note => {
                    const noteTime = typeof note.time === 'string' ? 
                        jmonTone._parseTimeString(note.time, composition.bpm || 120) : note.time;
                    const noteDuration = typeof note.duration === 'string' ? 
                        jmonTone._parseTimeString(note.duration, composition.bpm || 120) : note.duration;
                    const noteEnd = noteTime + noteDuration;
                    sequenceDuration = Math.max(sequenceDuration, noteEnd);
                });
            }

            maxDuration = Math.max(maxDuration, sequenceDuration);
        });

        // Find longest loop duration
        let longestLoop = 0;
        composition.sequences.forEach(seq => {
            if (seq.loop && seq.loop !== false && typeof seq.loop === 'string') {
                const loopTime = jmonTone._parseTimeString(seq.loop, composition.bpm || 120);
                longestLoop = Math.max(longestLoop, loopTime);
            }
        });

        return longestLoop > 0 ? longestLoop : maxDuration;
    }

    /**
     * Convert JSON jmonTone format to Tone.js compatible format
     * @param {Object} jsonData - Raw JSON data from file
     * @returns {Object} Format compatible with Tone.js
     */
    static convertToToneFormat(jsonData) {
        console.log('🔄 jmonTone: Converting enhanced JSON to Tone.js format...');
        
        // Validate basic structure
        if (!jsonData.sequences || !Array.isArray(jsonData.sequences)) {
            throw new Error('Invalid jmonTone format: missing sequences array');
        }

        // Convert to format expected by ToneDAW
        const toneFormat = {
            bpm: jsonData.bpm || 120,
            keySignature: jsonData.keySignature || "C major",
            metadata: jsonData.metadata || {},
            // NEW: Include transport settings
            transport: jsonData.transport || {},
            // NEW: Include tempo and key signature maps
            tempoMap: jsonData.tempoMap || [],
            keySignatureMap: jsonData.keySignatureMap || [],
            timeSignatureMap: jsonData.timeSignatureMap || [],
            // NEW: Audio graph and connections
            audioGraph: this.processAudioGraph(jsonData.audioGraph || []),
            connections: jsonData.connections || [],
            // NEW: Custom presets
            customPresets: jsonData.customPresets || [],
            // NEW: Automation and annotations
            automation: jsonData.automation || [],
            annotations: jsonData.annotations || [],
            globalEffects: this.convertGlobalEffects(jsonData.globalEffects),
            sequences: jsonData.sequences.map(seq => {
                const convertedSynth = this.convertSynthFormat(seq.synth, seq.synthRef, jsonData.audioGraph);
                
                return {
                    label: seq.label || "Untitled Track",
                    group: seq.group || "default",
                    loop: seq.loop || false,
                    loopEnd: seq.loopEnd,
                    // NEW: MIDI channel support
                    midiChannel: seq.midiChannel,
                    synth: convertedSynth,
                    effects: this.processEffectsChain(seq.effects || convertedSynth.effects),
                    notes: seq.notes.map(note => this.convertNoteFormat(note))
                };
            })
        };

        console.log('✅ jmonTone: Enhanced conversion complete');
        console.log(`   - ${toneFormat.sequences.length} sequences processed`);
        console.log(`   - ${toneFormat.audioGraph.length} audio graph nodes`);
        console.log(`   - ${toneFormat.connections.length} audio connections`);
        console.log(`   - ${Object.keys(toneFormat.globalEffects || {}).length} global effects`);
        
        return toneFormat;
    }

    /**
     * Convert synth configuration to Tone.js format (NEW: with synthRef support)
     * @param {Object} synthConfig - Synth configuration from JSON
     * @param {String} synthRef - Reference to audioGraph node
     * @param {Array} audioGraph - Audio graph nodes for reference lookup
     * @returns {Object} Tone.js compatible synth config
     */
    static convertSynthFormat(synthConfig, synthRef, audioGraph) {
        // NEW: Handle synthRef (reference to audioGraph node)
        if (synthRef && audioGraph) {
            const referencedNode = audioGraph.find(node => node.id === synthRef);
            if (referencedNode) {
                console.log(`🔗 jmonTone: Using synthRef "${synthRef}" from audioGraph`);
                return {
                    type: referencedNode.type,
                    ...referencedNode.options,
                    synthRef: synthRef // Keep reference for later use
                };
            } else {
                console.warn(`⚠️  jmonTone: synthRef "${synthRef}" not found in audioGraph`);
            }
        }

        if (!synthConfig) {
            return { type: 'Synth' };
        }

        const converted = {
            type: synthConfig.type || 'Synth'
        };

        // NEW: Handle preset references
        if (synthConfig.presetRef) {
            converted.presetRef = synthConfig.presetRef;
        }

        // Handle different synth types with their specific properties
        switch (synthConfig.type) {
            case 'PolySynth':
                if (synthConfig.voice) converted.voice = synthConfig.voice;
                if (synthConfig.polyphony) converted.polyphony = synthConfig.polyphony;
                if (synthConfig.maxPolyphony) converted.maxPolyphony = synthConfig.maxPolyphony;
                break;
            
            case 'MonoSynth':
                if (synthConfig.portamento) converted.portamento = synthConfig.portamento;
                break;
            
            case 'AMSynth':
                if (synthConfig.modulation) converted.modulation = synthConfig.modulation;
                if (synthConfig.modulationEnvelope) converted.modulationEnvelope = synthConfig.modulationEnvelope;
                break;
            
            case 'FMSynth':
                if (synthConfig.modulationIndex) converted.modulationIndex = synthConfig.modulationIndex;
                if (synthConfig.harmonicity) converted.harmonicity = synthConfig.harmonicity;
                if (synthConfig.modulation) converted.modulation = synthConfig.modulation;
                if (synthConfig.modulationEnvelope) converted.modulationEnvelope = synthConfig.modulationEnvelope;
                break;
            
            case 'DuoSynth':
                if (synthConfig.voice0) converted.voice0 = synthConfig.voice0;
                if (synthConfig.voice1) converted.voice1 = synthConfig.voice1;
                if (synthConfig.harmonicity) converted.harmonicity = synthConfig.harmonicity;
                if (synthConfig.vibratoAmount) converted.vibratoAmount = synthConfig.vibratoAmount;
                if (synthConfig.vibratoRate) converted.vibratoRate = synthConfig.vibratoRate;
                break;
            
            case 'PluckSynth':
                if (synthConfig.attackNoise) converted.attackNoise = synthConfig.attackNoise;
                if (synthConfig.dampening) converted.dampening = synthConfig.dampening;
                if (synthConfig.resonance) converted.resonance = synthConfig.resonance;
                break;
            
            case 'NoiseSynth':
                if (synthConfig.noise) converted.noise = synthConfig.noise;
                break;

            case 'Sampler':
                if (synthConfig.urls) converted.urls = synthConfig.urls;
                if (synthConfig.baseUrl) converted.baseUrl = synthConfig.baseUrl;
                if (synthConfig.attack) converted.attack = synthConfig.attack;
                if (synthConfig.release) converted.release = synthConfig.release;
                if (synthConfig.curve) converted.curve = synthConfig.curve;
                break;
        }

        // Common properties for all synths
        if (synthConfig.oscillator) converted.oscillator = synthConfig.oscillator;
        if (synthConfig.envelope) converted.envelope = synthConfig.envelope;
        if (synthConfig.filter) converted.filter = synthConfig.filter;
        if (synthConfig.filterEnvelope) converted.filterEnvelope = synthConfig.filterEnvelope;
        
        // NEW: Include options from schema
        if (synthConfig.options) {
            Object.assign(converted, synthConfig.options);
        }
        
        // Store effects separately for processing
        if (synthConfig.effects) converted.effects = synthConfig.effects;

        console.log(`🎛️ jmonTone: Converted ${synthConfig.type} synth with ${synthConfig.effects?.length || 0} effects`);
        return converted;
    }

    /**
     * Convert note format to ensure compatibility (NEW: with MIDI and modulation support)
     * @param {Object} note - Note object from JSON
     * @returns {Object} Tone.js compatible note
     */
    static convertNoteFormat(note) {
        const converted = {
            note: this.processNoteInput(note.note),
            time: note.time || 0,
            start: note.start || note.time || 0, // Ensure both time and start exist
            duration: note.duration || '4n',
            velocity: note.velocity || 0.8
        };

        // NEW: Add MIDI channel support
        if (note.channel !== undefined) {
            converted.channel = note.channel;
        }

        // NEW: Add articulation support
        if (note.articulation) {
            converted.articulation = note.articulation;
        }

        // NEW: Add microtuning support
        if (note.microtuning !== undefined) {
            converted.microtuning = note.microtuning;
        }

        // NEW: Add modulation events support with Tone.js mapping
        if (note.modulations && Array.isArray(note.modulations)) {
            // Keep original modulations
            converted.modulations = note.modulations.map(mod => ({
                type: mod.type,
                controller: mod.controller,
                value: mod.value,
                time: mod.time
            }));

            // Generate Tone.js compatible automation from MIDI modulations
            const toneModulations = this.mapMIDIModulationToTone(note.modulations);
            converted.toneModulations = toneModulations;
            
            // Generate automation events for Tone.js
            const noteStartTime = typeof converted.time === 'string' ? 
                this._parseTimeString(converted.time) : converted.time;
            converted.automationEvents = this.generateToneAutomationFromMIDI(toneModulations, noteStartTime);
        }

        return converted;
    }

    /**
     * Convert global effects configuration
     * @param {Object} globalEffects - Global effects from JSON
     * @returns {Object} Processed global effects
     */
    static convertGlobalEffects(globalEffects) {
        if (!globalEffects) return {};
        
        console.log('🌐 jmonTone: Processing global effects:', Object.keys(globalEffects));
        return globalEffects;
    }

    /**
     * Process effects chain for a synth (NEW: with preset reference support)
     * @param {Array} effects - Array of effect configurations
     * @returns {Array} Processed effects chain
     */
    static processEffectsChain(effects) {
        if (!effects || !Array.isArray(effects)) return [];
        
        return effects.map(effect => {
            const processed = {
                type: effect.type,
                ...effect
            };
            
            // NEW: Handle preset references
            if (effect.presetRef) {
                processed.presetRef = effect.presetRef;
            }
            
            // NEW: Handle options from schema
            if (effect.options) {
                Object.assign(processed, effect.options);
            }
            
            delete processed.type; // Remove type from parameters
            return {
                effectType: effect.type,
                parameters: processed
            };
        });
    }

    /**
     * Process audio graph nodes (NEW: for audio graph support)
     * @param {Array} audioGraph - Array of audio graph nodes
     * @returns {Array} Processed audio graph nodes
     */
    static processAudioGraph(audioGraph) {
        if (!audioGraph || !Array.isArray(audioGraph)) return [];
        
        console.log('🎚️ jmonTone: Processing audio graph with', audioGraph.length, 'nodes');
        
        return audioGraph.map(node => {
            const processed = {
                id: node.id,
                type: node.type,
                options: node.options || {}
            };

            if (node.target) {
                processed.target = node.target;
            }

            if (node.presetRef) {
                processed.presetRef = node.presetRef;
            }

            return processed;
        });
    }

    /**
     * Resolve custom presets (NEW: for custom preset support)
     * @param {Array} customPresets - Array of custom presets
     * @param {String} presetRef - Reference to preset
     * @returns {Object} Resolved preset options
     */
    static resolveCustomPreset(customPresets, presetRef) {
        if (!customPresets || !presetRef) return {};
        
        const preset = customPresets.find(p => p.id === presetRef);
        if (preset) {
            console.log(`🎯 jmonTone: Resolved custom preset "${presetRef}"`);
            return {
                type: preset.type,
                ...preset.options
            };
        } else {
            console.warn(`⚠️  jmonTone: Custom preset "${presetRef}" not found`);
            return {};
        }
    }

    /**
     * Process automation events (NEW: for automation support)
     * @param {Array} automation - Array of automation events
     * @returns {Array} Processed automation events
     */
    static processAutomation(automation) {
        if (!automation || !Array.isArray(automation)) return [];
        
        console.log('🤖 jmonTone: Processing', automation.length, 'automation events');
        
        return automation.map(event => ({
            target: event.target,
            time: event.time,
            value: event.value,
            // Convert time if it's a string
            timeSeconds: typeof event.time === 'string' ? 
                this._parseTimeString(event.time) : event.time
        }));
    }

    /**
     * Process annotations (NEW: for annotation support)
     * @param {Array} annotations - Array of annotation objects
     * @returns {Array} Processed annotations
     */
    static processAnnotations(annotations) {
        if (!annotations || !Array.isArray(annotations)) return [];
        
        console.log('📝 jmonTone: Processing', annotations.length, 'annotations');
        
        return annotations.map(annotation => ({
            text: annotation.text,
            time: annotation.time,
            type: annotation.type || 'comment',
            duration: annotation.duration,
            // Convert time if it's a string
            timeSeconds: typeof annotation.time === 'string' ? 
                this._parseTimeString(annotation.time) : annotation.time
        }));
    }

    /**
     * Calculate composition duration with tempo map support (NEW: enhanced duration calculation)
     * @param {object} composition - jmonTone composition
     * @returns {number} Duration in seconds
     */
    static calculateDurationWithTempoMap(composition) {
        // If there's a tempo map, we need more sophisticated calculation
        if (composition.tempoMap && composition.tempoMap.length > 0) {
            // This would require more complex tempo-aware duration calculation
            // For now, fall back to basic calculation
            console.log('⏱️ jmonTone: Tempo map detected, using enhanced duration calculation');
        }
        
        // Use existing duration calculation as fallback
        return this.calculateDuration(composition);
    }

    /**
     * Get effective tempo at a given time (NEW: for tempo map support)
     * @param {Array} tempoMap - Tempo map array
     * @param {number} time - Time in seconds
     * @param {number} defaultBpm - Default BPM if no tempo map
     * @returns {number} BPM at the given time
     */
    static getTempoAtTime(tempoMap, time, defaultBpm = 120) {
        if (!tempoMap || tempoMap.length === 0) {
            return defaultBpm;
        }

        // Find the most recent tempo change before or at the given time
        let effectiveTempo = defaultBpm;
        
        for (const tempoChange of tempoMap) {
            const changeTime = typeof tempoChange.time === 'string' ? 
                this._parseTimeString(tempoChange.time) : tempoChange.time;
            
            if (changeTime <= time) {
                effectiveTempo = tempoChange.bpm;
            } else {
                break;
            }
        }

        return effectiveTempo;
    }

    /**
     * Get effective key signature at a given time (NEW: for key signature map support)
     * @param {Array} keySignatureMap - Key signature map array
     * @param {number} time - Time in seconds
     * @param {string} defaultKey - Default key signature
     * @returns {string} Key signature at the given time
     */
    static getKeySignatureAtTime(keySignatureMap, time, defaultKey = "C") {
        if (!keySignatureMap || keySignatureMap.length === 0) {
            return defaultKey;
        }

        // Find the most recent key signature change before or at the given time
        let effectiveKey = defaultKey;
        
        for (const keyChange of keySignatureMap) {
            const changeTime = typeof keyChange.time === 'string' ? 
                this._parseTimeString(keyChange.time) : keyChange.time;
            
            if (changeTime <= time) {
                effectiveKey = keyChange.keySignature;
            } else {
                break;
            }
        }

        return effectiveKey;
    }

    /**
     * Create a basic JMON composition structure (NEW: compliant with extended schema)
     * @param {Object} options - Options for the composition
     * @returns {Object} Basic JMON composition structure
     */
    static createBasicComposition(options = {}) {
        return {
            format: jmonTone.FORMAT_IDENTIFIER,
            version: jmonTone.VERSION,
            bpm: options.bpm || 120,
            keySignature: options.keySignature || "C",
            timeSignature: options.timeSignature || "4/4",
            metadata: {
                name: options.name || "Untitled Composition",
                author: options.author || "Unknown",
                ...options.metadata
            },
            transport: {
                startOffset: 0,
                globalLoop: false,
                swing: 0,
                ...options.transport
            },
            customPresets: options.customPresets || [],
            audioGraph: options.audioGraph || [
                {
                    id: "master",
                    type: "Destination",
                    options: {}
                }
            ],
            connections: options.connections || [],
            sequences: options.sequences || [],
            automation: options.automation || [],
            annotations: options.annotations || [],
            tempoMap: options.tempoMap || [],
            keySignatureMap: options.keySignatureMap || [],
            timeSignatureMap: options.timeSignatureMap || []
        };
    }

    /**
     * Add a sequence to a JMON composition (NEW: with enhanced schema support)
     * @param {Object} composition - JMON composition
     * @param {Object} sequenceOptions - Options for the sequence
     * @returns {Object} Updated composition
     */
    static addSequence(composition, sequenceOptions) {
        const sequence = {
            label: sequenceOptions.label || `Sequence ${composition.sequences.length + 1}`,
            notes: sequenceOptions.notes || [],
            midiChannel: sequenceOptions.midiChannel,
            loop: sequenceOptions.loop || false,
            loopEnd: sequenceOptions.loopEnd,
            effects: sequenceOptions.effects || []
        };

        // Handle synth or synthRef
        if (sequenceOptions.synthRef) {
            sequence.synthRef = sequenceOptions.synthRef;
        } else if (sequenceOptions.synth) {
            sequence.synth = sequenceOptions.synth;
        } else {
            // Default synth
            sequence.synth = {
                type: "Synth",
                options: {
                    oscillator: { type: "sine" },
                    envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 1 }
                }
            };
        }

        composition.sequences.push(sequence);
        return composition;
    }

    /**
     * Add an audio graph node (NEW: for audio graph management)
     * @param {Object} composition - JMON composition
     * @param {Object} nodeOptions - Options for the audio node
     * @returns {Object} Updated composition
     */
    static addAudioGraphNode(composition, nodeOptions) {
        const node = {
            id: nodeOptions.id || `node_${composition.audioGraph.length}`,
            type: nodeOptions.type || "Synth",
            options: nodeOptions.options || {}
        };

        if (nodeOptions.target) {
            node.target = nodeOptions.target;
        }

        if (nodeOptions.presetRef) {
            node.presetRef = nodeOptions.presetRef;
        }

        composition.audioGraph.push(node);
        return composition;
    }

    /**
     * Add a connection between audio graph nodes (NEW: for audio routing)
     * @param {Object} composition - JMON composition
     * @param {String} source - Source node ID
     * @param {String} target - Target node ID
     * @returns {Object} Updated composition
     */
    static addConnection(composition, source, target) {
        composition.connections.push([source, target]);
        return composition;
    }

    /**
     * Add automation event (NEW: for automation support)
     * @param {Object} composition - JMON composition
     * @param {Object} automationOptions - Automation event options
     * @returns {Object} Updated composition
     */
    static addAutomation(composition, automationOptions) {
        const automation = {
            target: automationOptions.target,
            time: automationOptions.time,
            value: automationOptions.value
        };

        composition.automation.push(automation);
        return composition;
    }

    /**
     * Add annotation (NEW: for annotation support)
     * @param {Object} composition - JMON composition
     * @param {Object} annotationOptions - Annotation options
     * @returns {Object} Updated composition
     */
    static addAnnotation(composition, annotationOptions) {
        const annotation = {
            text: annotationOptions.text,
            time: annotationOptions.time,
            type: annotationOptions.type || "comment"
        };

        if (annotationOptions.duration) {
            annotation.duration = annotationOptions.duration;
        }

        composition.annotations.push(annotation);
        return composition;
    }

    /**
     * Generate automation events for Tone.js from MIDI modulations
     * @param {Array} toneModulations - Mapped tone modulations
     * @param {number} noteStartTime - Start time of the note
     * @returns {Array} Array of automation events for Tone.js
     */
    static generateToneAutomationFromMIDI(toneModulations, noteStartTime) {
        if (!toneModulations || !Array.isArray(toneModulations)) {
            return [];
        }
        
        return toneModulations.map(mod => ({
            target: mod.toneTarget,
            value: mod.toneValue,
            time: noteStartTime + (typeof mod.time === 'string' ? 
                this._parseTimeString(mod.time) : mod.time),
            frequency: mod.toneFrequency // For LFO-based modulations
        }));
    }

    /**
     * Apply MIDI modulations to a Tone.js synth instance
     * @param {Object} synth - Tone.js synth instance
     * @param {Array} automationEvents - Automation events to apply
     */
    static applyMIDIModulationsToTone(synth, automationEvents) {
        if (!automationEvents || !Array.isArray(automationEvents)) {
            return;
        }
        
        automationEvents.forEach(event => {
            try {
                const target = this._getNestedProperty(synth, event.target);
                if (target && typeof target.setValueAtTime === 'function') {
                    target.setValueAtTime(event.value, event.time);
                } else if (target && typeof target.set === 'function') {
                    // For some parameters that use set() instead of setValueAtTime()
                    target.set(event.value);
                } else {
                    console.warn(`Unable to apply automation to ${event.target} on synth`);
                }
            } catch (error) {
                console.warn(`Error applying automation to ${event.target}:`, error);
            }
        });
    }

    /**
     * Get nested property from object using dot notation
     * @param {Object} obj - Object to search
     * @param {string} path - Dot notation path (e.g., "filter.frequency")
     * @returns {*} Property value or undefined
     */
    static _getNestedProperty(obj, path) {
        if (!obj || !path) return undefined;
        
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : undefined;
        }, obj);
    }

    /**
     * Generate Tone.js code from JMON modulations (for debugging/export)
     * @param {Object} composition - JMON composition
     * @returns {string} Generated Tone.js code
     */
    static generateToneJSModulationCode(composition) {
        let code = '// Generated Tone.js code from JMON\n';
        code += 'const synths = {};\n';
        code += 'const effects = {};\n\n';
        
        // Generate synth creation code
        if (composition.audioGraph) {
            composition.audioGraph.forEach(node => {
                if (node.type !== 'Destination') {
                    code += `synths.${node.id} = new Tone.${node.type}(${JSON.stringify(node.options || {})});\n`;
                }
            });
        }
        
        code += '\n// Audio connections\n';
        if (composition.connections) {
            composition.connections.forEach(([source, target]) => {
                if (target === 'master') {
                    code += `synths.${source}.toDestination();\n`;
                } else {
                    code += `synths.${source}.connect(synths.${target});\n`;
                }
            });
        }
        
        code += '\n// Note scheduling and modulations\n';
        if (composition.sequences) {
            composition.sequences.forEach((seq, seqIndex) => {
                code += `// Sequence: ${seq.label}\n`;
                seq.notes.forEach((note, noteIndex) => {
                    const synthRef = seq.synthRef || 'defaultSynth';
                    code += `synths.${synthRef}.triggerAttackRelease("${note.note}", "${note.duration}", ${note.time}, ${note.velocity || 0.8});\n`;
                    
                    if (note.modulations) {
                        note.modulations.forEach(mod => {
                            code += `// ${mod.type} modulation: ${mod.controller || 'N/A'} = ${mod.value}\n`;
                        });
                    }
                });
                code += '\n';
            });
        }
        
        return code;
    }

    /**
     * Validate JMON composition with detailed error reporting
     * @param {Object} composition - JMON composition to validate
     * @param {boolean} strict - Whether to use strict validation
     * @returns {Object} Detailed validation result
     */
    static validateDetailed(composition, strict = false) {
        const result = this.validate(composition);
        const details = {
            ...result,
            details: {
                audioGraph: { valid: true, nodes: 0, issues: [] },
                sequences: { valid: true, count: 0, issues: [] },
                connections: { valid: true, count: 0, issues: [] },
                modulations: { valid: true, count: 0, issues: [] }
            }
        };
        
        // Detailed audioGraph validation
        if (composition.audioGraph) {
            details.details.audioGraph.nodes = composition.audioGraph.length;
            composition.audioGraph.forEach((node, index) => {
                if (!node.id) {
                    details.details.audioGraph.issues.push(`Node ${index}: Missing ID`);
                    details.details.audioGraph.valid = false;
                }
                if (!node.type) {
                    details.details.audioGraph.issues.push(`Node ${index}: Missing type`);
                    details.details.audioGraph.valid = false;
                }
            });
        }
        
        // Detailed sequences validation
        if (composition.sequences) {
            details.details.sequences.count = composition.sequences.length;
            composition.sequences.forEach((seq, seqIndex) => {
                if (!seq.notes || !Array.isArray(seq.notes)) {
                    details.details.sequences.issues.push(`Sequence ${seqIndex}: Missing notes array`);
                    details.details.sequences.valid = false;
                } else {
                    seq.notes.forEach((note, noteIndex) => {
                        if (note.modulations) {
                            details.details.modulations.count += note.modulations.length;
                            note.modulations.forEach((mod, modIndex) => {
                                if (mod.type === 'cc' && mod.controller === undefined) {
                                    details.details.modulations.issues.push(
                                        `Seq ${seqIndex}, Note ${noteIndex}, Mod ${modIndex}: CC missing controller`
                                    );
                                    details.details.modulations.valid = false;
                                }
                            });
                        }
                    });
                }
            });
        }
        
        // Detailed connections validation
        if (composition.connections) {
            details.details.connections.count = composition.connections.length;
            composition.connections.forEach((conn, index) => {
                if (!Array.isArray(conn) || conn.length !== 2) {
                    details.details.connections.issues.push(`Connection ${index}: Invalid format`);
                    details.details.connections.valid = false;
                }
            });
        }
        
        return details;
    }

    /**
     * Parse musical time string to seconds (helper function)
     * @param {string} timeString - Musical time notation (e.g., "1:2:0", "4n", "2m")
     * @param {number} bpm - Beats per minute for conversion
     * @returns {number} Time in seconds
     */
    static _parseTimeString(timeString, bpm = 120) {
        if (typeof timeString === 'number') {
            return timeString;
        }
        
        if (typeof timeString !== 'string') {
            console.warn(`Invalid time string: ${timeString}, defaulting to 0`);
            return 0;
        }

        try {
            // Handle note values (4n, 8n, 1m, etc.)
            if (timeString.match(/^\d+[nmhqwst]$/)) {
                const noteValue = timeString.slice(0, -1);
                const noteType = timeString.slice(-1);
                
                const beatLength = 60 / bpm; // seconds per beat
                
                switch (noteType) {
                    case 'n': // note (quarter note = 1 beat)
                        return beatLength * (4 / parseInt(noteValue));
                    case 'm': // measure (4 beats)
                        return beatLength * 4 * parseInt(noteValue);
                    case 'h': // half note
                        return beatLength * 2 * parseInt(noteValue);
                    case 'q': // quarter note
                        return beatLength * parseInt(noteValue);
                    case 'w': // whole note
                        return beatLength * 4 * parseInt(noteValue);
                    case 't': // triplet
                        return beatLength * (4 / parseInt(noteValue)) * (2/3);
                    case 's': // sixteenth
                        return beatLength * (1/4) * parseInt(noteValue);
                    default:
                        return beatLength;
                }
            }
            
            // Handle bar:beat:subdivision format (e.g., "1:2:0")
            if (timeString.includes(':')) {
                const parts = timeString.split(':').map(p => parseFloat(p));
                const bars = parts[0] || 0;
                const beats = parts[1] || 0;
                const subdivisions = parts[2] || 0;
                
                const beatLength = 60 / bpm;
                const barLength = beatLength * 4; // Assuming 4/4 time
                
                return bars * barLength + beats * beatLength + subdivisions * (beatLength / 4);
            }
            
            // Try parsing as a number
            const parsed = parseFloat(timeString);
            if (!isNaN(parsed)) {
                return parsed;
            }
            
            console.warn(`Unable to parse time string: ${timeString}, defaulting to 0`);
            return 0;
            
        } catch (error) {
            console.warn(`Error parsing time string ${timeString}:`, error);
            return 0;
        }
    }

    /**
     * Generate example compositions demonstrating different modulation types
     * @returns {Object} Examples object with different modulation demos
     */
    static generateModulationExamples() {
        return {
            // Example 1: Vibrato modulation
            vibratoDemo: {
                format: "jmonTone",
                version: "1.0",
                bpm: 120,
                audioGraph: [
                    { id: "master", type: "Destination", options: {} }
                ],
                connections: [],
                synthConfig: { type: "Synth", modulationTarget: "vibrato" },
                sequences: [{
                    label: "Vibrato Demo",
                    notes: [{
                        note: "C4",
                        time: 0,
                        duration: 3,
                        velocity: 0.8,
                        modulations: [
                            { type: "cc", controller: 1, value: 0, time: 0 },    // No vibrato
                            { type: "cc", controller: 1, value: 127, time: 2 }   // Full vibrato
                        ]
                    }]
                }]
            },

            // Example 2: Filter sweep
            filterDemo: {
                format: "jmonTone",
                version: "1.0",
                bpm: 120,
                audioGraph: [
                    { id: "master", type: "Destination", options: {} }
                ],
                connections: [],
                synthConfig: { type: "Synth", modulationTarget: "filter" },
                sequences: [{
                    label: "Filter Demo",
                    notes: [{
                        note: "G3",
                        time: 0,
                        duration: 4,
                        velocity: 0.8,
                        modulations: [
                            { type: "cc", controller: 1, value: 0, time: 0 },    // Low filter
                            { type: "cc", controller: 1, value: 127, time: 3 }   // High filter
                        ]
                    }]
                }]
            },

            // Example 3: Pitch bend + modulation wheel
            combinedDemo: {
                format: "jmonTone",
                version: "1.0",
                bpm: 120,
                audioGraph: [
                    { id: "master", type: "Destination", options: {} }
                ],
                connections: [],
                synthConfig: { type: "Synth", modulationTarget: "filter" },
                sequences: [{
                    label: "Combined Demo",
                    notes: [
                        {
                            note: "C4",
                            time: 0,
                            duration: 2,
                            velocity: 0.8,
                            modulations: [
                                { type: "pitchBend", value: -4096, time: 0 },  // Start low
                                { type: "pitchBend", value: 4096, time: 1.5 }  // End high
                            ]
                        },
                        {
                            note: "G4", 
                            time: 2,
                            duration: 2,
                            velocity: 0.8,
                            modulations: [
                                { type: "cc", controller: 1, value: 0, time: 0 },    // Start closed
                                { type: "cc", controller: 1, value: 127, time: 1.5 } // End open
                            ]
                        }
                    ]
                }]
            }
        };
    }

    /**
     * Map raw MIDI modulations and converter hints to Tone.js parameters
     * @param {Array} modulations - Raw modulations array from JMON
     * @param {Object} synthConfig - JMON synthConfig or converterHints.tone
     * @param {Object} hints - Optional hints from converterHints.tone
     * @returns {Object} toneModulations with toneTarget and toneValue
     */
    static mapMIDIModulationToTone(modulations, synthConfig = {}, hints = {}) {
        return modulations.reduce((acc, mod) => {
            const mapped = { ...mod };
            
            if (mod.type === 'pitchBend') {
                // Standard pitch bend range: ±2 semitones (±8192 = ±2 semitones)
                const semitones = (mod.value / 8192) * 2;
                mapped.toneTarget = 'detune';
                mapped.toneValue = semitones * 100; // Convert to cents
            } else if (mod.type === 'cc') {
                const ccKey = `cc${mod.controller}`;
                const hint = hints[ccKey];
                
                switch (mod.controller) {
                    case 1: // Modulation Wheel
                        const target = hint?.target || synthConfig.modulationTarget || 'filter';
                        mapped.toneTarget = target;
                        const norm = mod.value / 127;
                        
                        switch (target) {
                            case 'vibrato':
                                mapped.toneValue = norm * (hint?.depthRange?.[1] || 50); // cents
                                mapped.toneFrequency = hint?.frequency || 6; // Hz
                                break;
                            case 'tremolo':
                                mapped.toneValue = norm * (hint?.depthRange?.[1] || 0.8); // depth
                                mapped.toneFrequency = hint?.frequency || 4; // Hz
                                break;
                            case 'glissando':
                                mapped.toneValue = (norm - 0.5) * (hint?.depthRange?.[1] || 200) * 2; // cents
                                break;
                            case 'filter':
                            default:
                                const minF = hint?.depthRange?.[0] || 200;
                                const maxF = hint?.depthRange?.[1] || 4000;
                                mapped.toneValue = minF * Math.pow(maxF / minF, norm);
                        }
                        break;
                        
                    case 7: // Volume
                        mapped.toneTarget = 'volume';
                        mapped.toneValue = -40 + (mod.value / 127) * 40; // -40dB to 0dB
                        break;
                        
                    case 11: // Expression
                        mapped.toneTarget = hint?.target || 'volume';
                        mapped.toneValue = -20 + (mod.value / 127) * 20; // -20dB to 0dB
                        break;
                        
                    case 64: // Sustain Pedal
                        mapped.toneTarget = 'sustain';
                        mapped.toneValue = mod.value >= 64 ? 1 : 0; // On/Off
                        break;
                        
                    case 71: // Resonance/Harmonic Content
                        mapped.toneTarget = 'filter.Q';
                        mapped.toneValue = 0.1 + (mod.value / 127) * 29.9; // 0.1 to 30
                        break;
                        
                    case 72: // Release Time
                        mapped.toneTarget = 'envelope.release';
                        mapped.toneValue = 0.001 + (mod.value / 127) * 3.999; // 1ms to 4s
                        break;
                        
                    case 73: // Attack Time
                        mapped.toneTarget = 'envelope.attack';
                        mapped.toneValue = 0.001 + (mod.value / 127) * 1.999; // 1ms to 2s
                        break;
                        
                    case 74: // Cutoff Frequency
                        mapped.toneTarget = 'filter.frequency';
                        const minCutoff = hint?.depthRange?.[0] || 20;
                        const maxCutoff = hint?.depthRange?.[1] || 20000;
                        mapped.toneValue = minCutoff * Math.pow(maxCutoff / minCutoff, mod.value / 127);
                        break;
                        
                    default:
                        // Generic CC mapping based on hints
                        if (hint) {
                            mapped.toneTarget = hint.target || 'volume';
                            const norm = mod.value / 127;
                            if (hint.depthRange) {
                                const [min, max] = hint.depthRange;
                                mapped.toneValue = min + norm * (max - min);
                            } else {
                                mapped.toneValue = norm;
                            }
                        } else {
                            // Fallback: map to volume with warning
                            console.warn(`Unmapped CC${mod.controller}, defaulting to volume control`);
                            mapped.toneTarget = 'volume';
                            mapped.toneValue = -20 + (mod.value / 127) * 20;
                        }
                }
            } else if (mod.type === 'aftertouch') {
                // Channel pressure aftertouch
                mapped.toneTarget = hint?.target || 'filter.frequency';
                const norm = mod.value / 127;
                if (mapped.toneTarget === 'filter.frequency') {
                    const minF = hint?.depthRange?.[0] || 200;
                    const maxF = hint?.depthRange?.[1] || 2000;
                    mapped.toneValue = minF + norm * (maxF - minF);
                } else {
                    mapped.toneValue = norm;
                }
            }
            
            acc.push(mapped);
            return acc;
        }, []);
    }

    /**
     * Play a JMON composition using Tone.js, applying converterHints for modulation.
     * @param {Object} composition - JMON composition with synthConfig and converterHints
     */
    static async playComposition(composition) {
        await Tone.start();
        console.log(`Tone.js started successfully, context state: ${Tone.context.state}`);
        
        const { synthConfig = {}, converterHints = {} } = composition;
        const toneHints = converterHints.tone || {};
        
        // Create a map of synths based on audioGraph nodes
        const synthMap = new Map();
        
        // Process audioGraph to create individual synths
        for (const node of composition.audioGraph || []) {
            if (node.type === 'Sampler' && node.options?.urls) {
                console.log(`Creating Sampler: ${node.id}`);
                
                // Merge envelope settings from multiple sources with priority:
                // 1. node.options.envelope (highest)
                // 2. synthConfig.options.envelope (medium) 
                // 3. default values (lowest)
                const defaultEnvelope = {
                    attack: 0.01,
                    decay: 0.1,
                    sustain: 0.8,
                    release: 0.3
                };
                
                const globalEnvelope = synthConfig?.options?.envelope || {};
                const nodeEnvelope = node.options?.envelope || {};
                
                const finalEnvelope = {
                    ...defaultEnvelope,
                    ...globalEnvelope,
                    ...nodeEnvelope
                };
                
                // Create Sampler with proper envelope configuration
                const samplerOptions = {
                    ...node.options,
                    attack: finalEnvelope.attack,
                    release: finalEnvelope.release
                };
                
                // Remove envelope from options to avoid conflicts
                delete samplerOptions.envelope;
                
                try {
                    const sampler = new Tone.Sampler(samplerOptions);
                    
                    // Apply envelope settings if Sampler supports them
                    if (sampler.envelope) {
                        Object.assign(sampler.envelope, {
                            attack: finalEnvelope.attack,
                            decay: finalEnvelope.decay,
                            sustain: finalEnvelope.sustain,
                            release: finalEnvelope.release
                        });
                        console.log(`Applied envelope to Sampler ${node.id}:`, finalEnvelope);
                    }
                    
                    synthMap.set(node.id, sampler);
                    console.log(`Created Sampler ${node.id} with envelope settings`);
                    
                    // Wait for samples to load with timeout
                    await new Promise((resolve, reject) => {
                        let attempts = 0;
                        const maxAttempts = 100; // 10 seconds timeout
                        
                        const checkLoaded = () => {
                            attempts++;
                            if (sampler.loaded) {
                                console.log(`✅ Sampler ${node.id} loaded successfully`);
                                resolve();
                            } else if (attempts >= maxAttempts) {
                                console.warn(`⚠️  Sampler ${node.id} loading timeout, continuing anyway`);
                                resolve(); // Continue execution even if not fully loaded
                            } else {
                                setTimeout(checkLoaded, 100);
                            }
                        };
                        checkLoaded();
                    });
                    
                } catch (error) {
                    console.error(`Failed to create Sampler ${node.id}:`, error);
                    // Create a fallback basic synth
                    const fallbackSynth = new Tone.Synth().toDestination();
                    synthMap.set(node.id, fallbackSynth);
                    console.log(`Created fallback Synth for ${node.id}`);
                }
            } else if (node.type !== 'Destination') {
                // Handle other synth types
                try {
                    let synth;
                    const synthOptions = node.options || {};
                    
                    switch (node.type) {
                        case 'Synth':
                            synth = new Tone.Synth(synthOptions);
                            break;
                        case 'PolySynth':
                            synth = new Tone.PolySynth(synthOptions);
                            break;
                        case 'MonoSynth':
                            synth = new Tone.MonoSynth(synthOptions);
                            break;
                        case 'AMSynth':
                            synth = new Tone.AMSynth(synthOptions);
                            break;
                        case 'FMSynth':
                            synth = new Tone.FMSynth(synthOptions);
                            break;
                        case 'DuoSynth':
                            synth = new Tone.DuoSynth(synthOptions);
                            break;
                        case 'PluckSynth':
                            synth = new Tone.PluckSynth(synthOptions);
                            break;
                        case 'NoiseSynth':
                            synth = new Tone.NoiseSynth(synthOptions);
                            break;
                        default:
                            console.warn(`Unknown synth type: ${node.type}, using basic Synth`);
                            synth = new Tone.Synth(synthOptions);
                    }
                    
                    synthMap.set(node.id, synth);
                    console.log(`Created ${node.type}: ${node.id}`);
                    
                } catch (error) {
                    console.error(`Failed to create ${node.type} ${node.id}:`, error);
                    // Fallback to basic synth
                    const fallbackSynth = new Tone.Synth();
                    synthMap.set(node.id, fallbackSynth);
                    console.log(`Created fallback Synth for ${node.id}`);
                }
            }
        }
        
        // Set up audio connections and effects
        const isSampler = synthConfig.type === 'Sampler';
        let filter, tremoloEffect;
        
        if (Object.values(toneHints).some(h => h.target === 'filter')) {
            const allMax = Object.values(toneHints)
                .filter(h => h.target === 'filter')
                .map(h => h.depthRange?.[1] || 4000);
            const initF = Math.max(...allMax, 200);
            filter = new Tone.Filter(initF, 'lowpass', { Q: 10 }).toDestination();
        }
        
        if (isSampler && Object.values(toneHints).some(h => h.target === 'tremolo')) {
            const tremoloHint = Object.values(toneHints).find(h => h.target === 'tremolo');
            tremoloEffect = new Tone.Tremolo(tremoloHint.frequency || 4, 0.5).start();
            console.log('Global tremolo effect created');
        }
        
        // Connect each synth to the audio chain
        synthMap.forEach((synth, nodeId) => {
            const synthType = synth.constructor.name || 'Synth';
            
            if (filter && tremoloEffect) {
                synth.connect(tremoloEffect).connect(filter);
            } else if (filter) {
                synth.connect(filter);
            } else if (tremoloEffect) {
                synth.connect(tremoloEffect).toDestination();
            } else {
                synth.toDestination();
            }
            
            console.log(`Connected ${nodeId}: ${synthType}→${tremoloEffect ? 'Tremolo→' : ''}${filter ? 'Filter→' : ''}Destination`);
        });
        
        const now = Tone.now();
        
        // Loop through sequences and notes
        composition.sequences.forEach(seq => {
            // Get the synth for this sequence
            const synth = synthMap.get(seq.synthRef);
            
            if (!synth) {
                console.error(`Synth not found for synthRef: ${seq.synthRef}`);
                return;
            }
            
            seq.notes.forEach((note, index) => {
                const t0 = now + note.time;
                
                // Calculate natural release time based on note duration
                // Release should take a portion of the note duration for natural fade
                const releasePercentage = 0.3; // Release takes 30% of note duration
                const naturalRelease = note.duration * releasePercentage;
                
                // Set the sampler's release time for this note (if supported)
                if (synth.release !== undefined && typeof synth.release !== 'function') {
                    synth.release = naturalRelease;
                }
                
                console.log(`Natural envelope: Note ${note.note} duration=${note.duration.toFixed(2)}s, release=${naturalRelease.toFixed(2)}s`);
                
                // Use triggerAttackRelease for cleaner note handling
                try {
                    if (synth.triggerAttackRelease) {
                        synth.triggerAttackRelease(note.note, note.duration, t0, note.velocity);
                    } else {
                        // Fallback for synths that don't support triggerAttackRelease
                        synth.triggerAttack(note.note, t0, note.velocity);
                        if (synth.triggerRelease) {
                            synth.triggerRelease(note.note, t0 + note.duration);
                        }
                    }
                } catch (error) {
                    console.warn(`Error triggering note ${note.note}:`, error);
                }
                

                
                // Handle modulations only if the note was successfully triggered
                if (note.modulations && Array.isArray(note.modulations)) {
                    // Pitch Bend - handle all pitch bend events sequentially
                    const bends = note.modulations.filter(m => m.type === 'pitchBend');
                    const isSamplerType = synth.constructor.name === 'Sampler' || synth._buffer !== undefined;
                    
                    if (bends.length > 0 && isSamplerType) {
                        console.warn(`⚠️  Pitch bend with Samplers uses playbackRate, which affects both pitch AND playback speed. For true pitch bending without timing changes, use oscillator-based synths.`);
                    }
                    
                    bends.forEach((bend, idx) => {
                        try {
                            const cents = (bend.value / 8192) * 1200;
                            const bendTime = t0 + (typeof bend.time === 'string' ? 
                                this._parseTimeString(bend.time, composition.bpm || 120) : bend.time);
                            
                            console.log(`Pitch bend ${idx}: value=${bend.value}, cents=${cents.toFixed(1)}, time=${bend.time}`);
                            
                            // For Samplers, use playbackRate to achieve pitch bending
                            if (synth.playbackRate) {
                                const playbackRateMultiplier = Math.pow(2, cents / 1200);
                                if (idx === 0) {
                                    synth.playbackRate.setValueAtTime(playbackRateMultiplier, bendTime);
                                } else {
                                    synth.playbackRate.exponentialRampToValueAtTime(playbackRateMultiplier, bendTime);
                                }
                            } else if (synth.frequency) {
                                // Fallback for regular synths
                                const baseFreq = Tone.Frequency(note.note).toFrequency();
                                const bendedFreq = baseFreq * Math.pow(2, cents / 1200);
                                if (idx === 0) {
                                    synth.frequency.setValueAtTime(bendedFreq, bendTime);
                                } else {
                                    synth.frequency.exponentialRampToValueAtTime(bendedFreq, bendTime);
                                }
                            }
                        } catch (error) {
                            console.warn(`Error applying pitch bend:`, error);
                        }
                    });
                    
                    // Reset pitch at note end if there were any bends
                    if (bends.length > 0) {
                        try {
                            if (synth.playbackRate) {
                                synth.playbackRate.exponentialRampToValueAtTime(1, t0 + note.duration);
                            } else if (synth.frequency) {
                                const baseFreq = Tone.Frequency(note.note).toFrequency();
                                synth.frequency.exponentialRampToValueAtTime(baseFreq, t0 + note.duration);
                            }
                        } catch (error) {
                            console.warn(`Error resetting pitch:`, error);
                        }
                    }
                }
                // CC variations
                const ccMods = (note.modulations || []).filter(m => m.type === 'cc');
                if (ccMods.length > 0) {
                    console.log(`🎛️  Processing ${ccMods.length} CC modulation(s) for note ${note.note}`);
                }
                ccMods.forEach((mod, i, arr) => {
                        const tm = now + mod.time;
                        const hint = toneHints[`cc${mod.controller}`] || {};
                        const norm = mod.value / 127;
                        const isSamplerType = synth.constructor.name === 'Sampler' || synth._buffer !== undefined;
                        
                        switch (hint.target) {
                            case 'vibrato': {
                                if (isSamplerType) {
                                    // For Samplers, create vibrato using playbackRate modulation
                                    // Convert cents to playbackRate ratio (cents/1200 = semitones, 2^(semitones/12) = ratio)
                                    const [minCents = -50, maxCents = 50] = hint.depthRange || [-50, 50];
                                    const minRatio = Math.pow(2, minCents / 1200);
                                    const maxRatio = Math.pow(2, maxCents / 1200);
                                    const currentRatio = minRatio + (maxRatio - minRatio) * norm;
                                    const lfoFreq = hint.frequency || 6;
                                    
                                    // Create LFO that oscillates around the current ratio
                                    const depth = (maxRatio - minRatio) / 2;
                                    const center = (minRatio + maxRatio) / 2;
                                    const lfo = new Tone.LFO(lfoFreq, center - depth, center + depth);
                                    if (synth.playbackRate) {
                                        lfo.connect(synth.playbackRate);
                                        lfo.start(tm);
                                        lfo.stop(t0 + note.duration);
                                        console.log(`Sampler vibrato applied: freq=${lfoFreq}Hz, cents range=${minCents}-${maxCents}, playbackRate=${center.toFixed(3)}±${depth.toFixed(3)}`);
                                    }
                                } else {
                                    // For regular synths, apply vibrato via LFO to detune
                                    const [mn = -50, mx = 50] = hint.depthRange || [-50, 50];
                                    const lfo = new Tone.LFO(hint.frequency || 6, mn, mx);
                                    if (synth.detune) {
                                        lfo.connect(synth.detune);
                                        lfo.start(tm);
                                        lfo.stop(t0 + note.duration);
                                        console.log(`Vibrato applied: freq=${hint.frequency || 6}Hz, depth=${mn}-${mx}cents`);
                                    }
                                }
                                break;
                            }
                            case 'tremolo': {
                                if (isSamplerType && tremoloEffect) {
                                    // Control tremolo depth for Samplers
                                    const [mn = 0, mx = 1] = hint.depthRange || [0, 1];
                                    const depth = mn + (mx - mn) * norm;
                                    tremoloEffect.depth.setValueAtTime(depth, tm);
                                    console.log(`Tremolo depth set to ${depth.toFixed(2)} at time ${tm.toFixed(2)}`);
                                } else if (!isSamplerType) {
                                    // For regular synths, create LFO connected to volume
                                    const [mn = -12, mx = 0] = hint.depthRange || [-12, 0];
                                    const lfo = new Tone.LFO(hint.frequency || 4, mn, mx);
                                    if (synth.volume) {
                                        lfo.connect(synth.volume);
                                        lfo.start(tm);
                                        lfo.stop(t0 + note.duration);
                                    }
                                } else {
                                    console.warn(`⚠️  Tremolo effect not properly initialized for Sampler`);
                                }
                                break;
                            }
                            case 'filter': {
                                if (filter) {
                                    const [mn = 200, mx = 4000] = hint.depthRange || [200,4000];
                                    const f = mn * Math.pow(mx / mn, norm);
                                    filter.frequency.setValueAtTime(f, tm);
                                    console.log(`🔧 Filter CC${mod.controller}: value=${mod.value} → frequency=${f.toFixed(0)}Hz at ${tm.toFixed(2)}s`);
                                    const nxt = arr[i+1];
                                    if (nxt) {
                                        const f1 = mn * Math.pow(mx/mn, nxt.value/127);
                                        filter.frequency.exponentialRampToValueAtTime(f1, now + nxt.time);
                                        console.log(`🔧 Filter ramp to ${f1.toFixed(0)}Hz at ${(now + nxt.time).toFixed(2)}s`);
                                    }
                                } else {
                                    console.warn(`⚠️  Filter CC${mod.controller} ignored - no filter in audio chain`);
                                }
                                break;
                            }
                        }
                    });
            });
        });
    }
}

// Export for Node.js (CommonJS)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = jmonTone;
}

// Export for browsers (global)
if (typeof window !== 'undefined') {
    window.jmonTone = jmonTone;
}
