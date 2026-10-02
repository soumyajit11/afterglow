import {test} from 'node:test';
import assert from 'node:assert/strict';
import {position,snapshot} from '../server/playback.js';
test('authoritative position advances only while playing',()=>{const room={position:12,playing:true,updatedAt:1000};assert.equal(position(room,3500),14.5);room.playing=false;assert.equal(position(room,3500),12);});
test('snapshot does not expose stored filename',()=>{const room={name:'Night',movie:{title:'movie.mp4',file:'private.mp4'},position:0,playing:false,updatedAt:0};assert.equal(snapshot(room).movie.file,undefined);assert.equal(snapshot(room).movie.title,'movie.mp4');});
