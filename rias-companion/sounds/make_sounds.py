#!/usr/bin/env python3
"""Builds Rias's alarm sounds from scratch (pure synthesis, nothing sampled).

Run:  python3 sounds/make_sounds.py   (needs numpy and ffmpeg with libvorbis)
Writes sounds/alarm_<name>.ogg. The Android build copies them into res/raw.
Each clip is short; the app loops it while an alarm is ringing.
"""
import pathlib
import subprocess
import tempfile
import wave

import numpy as np

RATE = 32000
HERE = pathlib.Path(__file__).resolve().parent
rng = np.random.default_rng(7)


def t_axis(sec):
    return np.arange(int(sec * RATE)) / RATE


def note(freq, sec, partials=((1, 1.0),), decay=3.0, attack=0.004):
    """A tone with optional (ratio, gain) partials and an exponential decay."""
    t = t_axis(sec)
    out = sum(g * np.sin(2 * np.pi * freq * r * t) * np.exp(-decay * r ** 0.5 * t) for r, g in partials)
    env = np.minimum(1, t / attack)
    return out * env


def place(track, sound, at):
    i = int(at * RATE)
    end = min(len(track), i + len(sound))
    track[i:end] += sound[: end - i]


def blank(sec):
    return np.zeros(int(sec * RATE))


BELL = ((1, 1.0), (2.76, 0.45), (5.4, 0.25), (8.93, 0.12))
PLUCK = ((1, 1.0), (2, 0.5), (3, 0.25), (4, 0.12))
BOX = ((1, 1.0), (3, 0.3), (5.2, 0.1))
hz = lambda name: 440 * 2 ** ((
    {'C': -9, 'D': -7, 'E': -5, 'F': -4, 'G': -2, 'A': 0, 'B': 2}[name[0]] + (1 if '#' in name else 0)
    + 12 * (int(name[-1]) - 4)) / 12)


def chime():
    # Two bright bell strikes, then a softer answer.
    tr = blank(2.6)
    place(tr, note(hz('E6'), 2.2, BELL, decay=2.2), 0.0)
    place(tr, note(hz('B5'), 2.2, BELL, decay=2.2) * 0.9, 0.32)
    place(tr, note(hz('E5'), 2.0, BELL, decay=2.0) * 0.6, 0.9)
    return tr


def harp():
    # A rising arpeggio, plucked.
    tr = blank(2.8)
    for i, n in enumerate(['C5', 'E5', 'G5', 'C6', 'E6', 'G6']):
        place(tr, note(hz(n), 2.0, PLUCK, decay=4.5) * (0.9 - i * 0.06), i * 0.14)
    place(tr, note(hz('C6'), 1.8, PLUCK, decay=3.5) * 0.5, 1.0)
    return tr


def music_box():
    # A small original tune in a music-box voice.
    tr = blank(3.2)
    tune = [('E6', 0.0), ('G6', 0.28), ('C7', 0.56), ('B6', 0.84), ('G6', 1.12), ('A6', 1.4), ('E6', 1.68), ('G6', 2.1)]
    for n, at in tune:
        place(tr, note(hz(n), 1.1, BOX, decay=5.0) * 0.8, at)
    place(tr, note(hz('C6'), 1.4, BOX, decay=3.0) * 0.35, 0.0)
    place(tr, note(hz('A5'), 1.4, BOX, decay=3.0) * 0.35, 1.4)
    return tr


def magic():
    # A shimmering rising sweep with sparkles: her magic circle lighting up.
    sec = 2.6
    t = t_axis(sec)
    f = 260 * (5 ** (np.minimum(t, 1.6) / 1.6))
    phase = 2 * np.pi * np.cumsum(f) / RATE
    sweep = (np.sin(phase) + 0.4 * np.sin(2 * phase) + 0.2 * np.sin(3.01 * phase))
    sweep *= np.minimum(1, t / 0.3) * np.exp(-1.6 * np.maximum(0, t - 1.4)) * 0.45
    tr = sweep.copy()
    for _ in range(18):
        at = rng.uniform(0.5, 2.2)
        place(tr, note(rng.uniform(2200, 4200), 0.5, ((1, 1), (2.01, 0.3)), decay=14) * rng.uniform(0.15, 0.35), at)
    place(tr, note(hz('A5'), 1.0, BELL, decay=3) * 0.5, 1.55)
    return tr


def classic():
    # The familiar beep-beep-beep-beep, softened at the edges.
    tr = blank(1.6)
    t = t_axis(0.11)
    beep = np.sign(np.sin(2 * np.pi * 1046 * t)) * 0.35 + np.sin(2 * np.pi * 2093 * t) * 0.15
    beep *= np.minimum(1, t / 0.005) * np.minimum(1, (0.11 - t) / 0.01)
    for i in range(4):
        place(tr, beep, i * 0.19)
    return tr


def pulse():
    # Low, calm swells for people who hate harsh alarms.
    sec = 2.7
    t = t_axis(sec)
    tone = np.sin(2 * np.pi * hz('A4') * t) + 0.6 * np.sin(2 * np.pi * hz('E5') * t) + 0.25 * np.sin(2 * np.pi * hz('A5') * t)
    swell = np.clip(np.sin(np.pi * ((t % 0.9) / 0.9)), 0, 1) ** 2
    return tone * swell * 0.5


SOUNDS = {'chime': chime, 'harp': harp, 'musicbox': music_box, 'magic': magic, 'classic': classic, 'pulse': pulse}


def write(name, data):
    data = data / max(1e-9, np.max(np.abs(data))) * 0.89
    pcm = (data * 32767).astype('<i2')
    with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
        with wave.open(tmp.name, 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(pcm.tobytes())
        out = HERE / f'alarm_{name}.ogg'
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp.name, '-c:a', 'libvorbis', '-q:a', '4', str(out)], check=True)
        print(f'{out.name}: {out.stat().st_size // 1024} KB')


if __name__ == '__main__':
    for name, fn in SOUNDS.items():
        write(name, fn())
