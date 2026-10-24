// The animated Rias on the Home screen: an original drawing (inline SVG) with idle
// breathing, blinking and hair sway, plus moods and a talking mouth driven by app.js.
window.createRiasAvatar = function createRiasAvatar(stage) {
  'use strict';

  stage.innerHTML = `
  <svg class="circle" viewBox="0 0 200 200" aria-hidden="true">
    <g fill="none" stroke="currentColor">
      <circle cx="100" cy="100" r="96" stroke-width="1.6"/>
      <circle cx="100" cy="100" r="86" stroke-width=".8"/>
      <circle cx="100" cy="100" r="58" stroke-width="1"/>
      <polygon points="100,14 174.5,143 25.5,143" stroke-width="1.2"/>
      <polygon points="100,186 25.5,57 174.5,57" stroke-width="1.2"/>
      <path d="M100 4 v10 M100 186 v10 M4 100 h10 M186 100 h10" stroke-width="1.2"/>
    </g>
    <g fill="currentColor" font-family="Georgia, serif" font-size="7" text-anchor="middle" opacity=".8">
      <text x="100" y="11">GREMORY</text><text x="100" y="196">KUOH</text>
    </g>
  </svg>
  <svg class="rias" viewBox="0 0 300 360" role="img" aria-label="Rias">
    <defs>
      <linearGradient id="rh" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e3284a"/><stop offset=".55" stop-color="#b8173a"/><stop offset="1" stop-color="#7d0c26"/>
      </linearGradient>
      <linearGradient id="rhf" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f0405f"/><stop offset="1" stop-color="#b8173a"/>
      </linearGradient>
      <radialGradient id="iris" cx=".5" cy=".38" r=".62">
        <stop offset="0" stop-color="#7fe3d6"/><stop offset=".55" stop-color="#22a59a"/><stop offset="1" stop-color="#0a4f5a"/>
      </radialGradient>
      <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffece3"/><stop offset="1" stop-color="#f9d5c6"/>
      </linearGradient>
      <clipPath id="eyeL"><path d="M112 140 Q127 126 143 138 Q141 154 127 156 Q114 154 112 140Z"/></clipPath>
      <clipPath id="eyeR"><path d="M188 140 Q173 126 157 138 Q159 154 173 156 Q186 154 188 140Z"/></clipPath>
    </defs>

    <!-- hair behind the body -->
    <g class="hair-back">
      <path fill="url(#rh)" d="M150 34 C86 34 58 84 60 146 C62 222 44 296 26 360 L274 360 C256 296 238 222 240 146 C242 84 214 34 150 34Z"/>
      <path fill="#8e0f2a" opacity=".45" d="M70 170 C66 240 54 300 44 360 L64 360 C70 300 78 240 82 180Z M230 170 C234 240 246 300 256 360 L236 360 C230 300 222 240 218 180Z"/>
    </g>

    <g class="body">
      <!-- neck -->
      <path fill="#f6cdbd" d="M134 190 L166 190 L168 236 Q150 246 132 236Z"/>
      <!-- blouse + Kuoh-style cape -->
      <path class="blouse" fill="#fbf6f4" d="M54 360 C60 292 96 252 150 246 C204 252 240 292 246 360Z"/>
      <path class="cape" fill="#1d1420" d="M52 360 C58 296 88 262 126 250 L150 312 L174 250 C212 262 242 296 248 360Z"/>
      <path class="cape-shade" fill="#2c1f31" d="M64 360 C70 312 92 282 118 268 L104 360Z M236 360 C230 312 208 282 182 268 L196 360Z"/>
      <!-- outfit extras: summer straps, pajama dots, winter scarf -->
      <path class="summer-straps" fill="none" stroke="#e8b04a" stroke-width="5" d="M118 262 L132 330 M182 262 L168 330"/>
      <g class="pj-dots" fill="#fff" opacity=".8"><circle cx="90" cy="320" r="4"/><circle cx="118" cy="300" r="4"/><circle cx="104" cy="345" r="4"/><circle cx="210" cy="320" r="4"/><circle cx="182" cy="300" r="4"/><circle cx="196" cy="345" r="4"/><circle cx="150" cy="340" r="4"/></g>
      <!-- collar -->
      <path class="collar" fill="#ffffff" d="M126 248 L150 292 L138 250Z M174 248 L150 292 L162 250Z"/>
      <g class="scarf"><path fill="#c8173a" d="M118 236 Q150 262 182 236 L188 254 Q150 284 112 254Z"/><path fill="#9e1030" d="M160 258 L174 330 L156 332 L148 262Z"/><path fill="#fff" opacity=".35" d="M120 246 Q150 268 180 246 L182 250 Q150 274 118 250Z"/></g>
      <!-- ribbon -->
      <g class="ribbon">
        <path fill="#c8173a" d="M150 292 L128 280 L131 302Z M150 292 L172 280 L169 302Z"/>
        <path fill="#9e1030" d="M150 292 L141 318 L147 320 L150 300 L153 320 L159 318Z"/>
        <circle cx="150" cy="292" r="5" fill="#e3284a"/>
      </g>
      <!-- front locks over the shoulders -->
      <path class="lock-l" fill="url(#rh)" d="M100 112 C82 170 92 236 70 312 C96 262 110 200 114 132Z"/>
      <path class="lock-r" fill="url(#rh)" d="M200 112 C218 170 208 236 230 312 C204 262 190 200 186 132Z"/>
    </g>

    <g class="head">
      <!-- face -->
      <path fill="url(#skin)" d="M100 116 C100 160 112 186 134 203 Q150 213 166 203 C188 186 200 160 200 116 C200 78 178 60 150 60 C122 60 100 78 100 116Z"/>
      <!-- ears -->
      <path fill="#f6cdbd" d="M100 134 Q90 132 92 146 Q94 158 103 156Z M200 134 Q210 132 208 146 Q206 158 197 156Z"/>
      <!-- blush -->
      <g class="blush"><ellipse cx="119" cy="168" rx="11" ry="5" fill="#ff7d96"/><ellipse cx="181" cy="168" rx="11" ry="5" fill="#ff7d96"/></g>

      <!-- eyes (open) -->
      <g class="eyes" transform="translate(150 145) scale(1.14) translate(-150 -145)">
        <g class="eye eye-l">
          <path fill="#fff" d="M112 140 Q127 126 143 138 Q141 154 127 156 Q114 154 112 140Z"/>
          <g clip-path="url(#eyeL)">
            <ellipse class="iris" cx="128" cy="143" rx="10" ry="12.5" fill="url(#iris)"/>
            <ellipse cx="128" cy="145" rx="4.5" ry="6" fill="#06333b"/>
            <circle cx="124" cy="138" r="3.6" fill="#fff"/><circle cx="132" cy="150" r="1.6" fill="#fff" opacity=".85"/>
          </g>
          <path fill="#3a0a16" d="M109 141 Q126 121 146 137 L143 140 Q127 128 112 143Z"/>
          <path fill="#3a0a16" d="M112 142 L102 134 L110 147Z"/>
        </g>
        <g class="eye eye-r">
          <path fill="#fff" d="M188 140 Q173 126 157 138 Q159 154 173 156 Q186 154 188 140Z"/>
          <g clip-path="url(#eyeR)">
            <ellipse class="iris" cx="172" cy="143" rx="10" ry="12.5" fill="url(#iris)"/>
            <ellipse cx="172" cy="145" rx="4.5" ry="6" fill="#06333b"/>
            <circle cx="168" cy="138" r="3.6" fill="#fff"/><circle cx="176" cy="150" r="1.6" fill="#fff" opacity=".85"/>
          </g>
          <path fill="#3a0a16" d="M191 141 Q174 121 154 137 L157 140 Q173 128 188 143Z"/>
          <path fill="#3a0a16" d="M188 142 L198 134 L190 147Z"/>
        </g>
      </g>
      <!-- eyes (closed, happy ^^) -->
      <g transform="translate(150 145) scale(1.14) translate(-150 -145)" class="eyes-happy" fill="none" stroke="#3a0a16" stroke-width="3.2" stroke-linecap="round">
        <path d="M114 146 Q127 132 141 146"/><path d="M159 146 Q173 132 186 146"/>
      </g>
      <!-- sleepy lids -->
      <g transform="translate(150 145) scale(1.14) translate(-150 -145)" class="lids" fill="#f9d9cb">
        <path d="M108 124 L146 124 L146 145 Q127 141 108 145Z"/><path d="M154 124 L192 124 L192 145 Q173 141 154 145Z"/>
      </g>

      <!-- nose -->
      <path d="M150 166 L148 172 L151 172" fill="none" stroke="#e0a594" stroke-width="1.6" stroke-linecap="round"/>
      <!-- mouths -->
      <path class="mouth mouth-smile" d="M140 184 Q150 192 160 184" fill="none" stroke="#a3283f" stroke-width="2.4" stroke-linecap="round"/>
      <path class="mouth mouth-open" d="M141 183 Q150 182 159 183 Q157 196 150 197 Q143 196 141 183Z" fill="#a3283f"/>
      <path class="mouth mouth-o" d="M146 186 Q150 180 154 186 Q154 192 150 192 Q146 192 146 186Z" fill="#a3283f"/>
      <path class="mouth mouth-flat" d="M142 187 Q150 185 158 187" fill="none" stroke="#a3283f" stroke-width="2.4" stroke-linecap="round"/>

      <!-- bangs -->
      <path fill="url(#rhf)" d="M96 128 C88 70 122 42 150 42 C184 42 212 70 204 130 C199 117 196 106 190 97 C192 113 190 127 184 140 C182 120 176 105 168 95 C168 111 164 123 158 131 C157 113 153 101 147 90 C143 105 137 119 127 129 C131 113 131 103 129 95 C121 109 115 123 107 138 C107 122 105 111 103 103 C99 111 97 119 96 128Z"/>
      <path fill="url(#rhf)" d="M103 104 C96 134 98 164 107 190 C109 166 111 136 117 112Z M197 104 C204 134 202 164 193 190 C191 166 189 136 183 112Z"/>
      <path fill="#ff6b86" opacity=".55" d="M120 62 C132 54 150 52 162 56 C150 58 134 62 124 70Z"/>
      <!-- brows -->
      <g class="brows" transform="translate(0 -10)" opacity=".9" fill="none" stroke="#9e1030" stroke-width="2.6" stroke-linecap="round">
        <path class="brow-l" d="M114 121 Q127 114 140 119"/><path class="brow-r" d="M186 121 Q173 114 160 119"/>
      </g>
      <!-- the famous strand on top -->
      <path class="ahoge" fill="url(#rhf)" d="M150 50 C154 22 172 10 190 18 C172 20 160 30 155 52Z"/>
    </g>

    <!-- gestures -->
    <g class="arm-wave">
      <path class="sleeve" d="M214 330 Q244 290 250 250 L260 204" fill="none" stroke="#1d1420" stroke-width="22" stroke-linecap="round"/>
      <g class="hand"><ellipse cx="262" cy="190" rx="13" ry="16" fill="url(#skin)"/><path d="M251 196 Q244 190 247 182" fill="none" stroke="#f0c2b0" stroke-width="5" stroke-linecap="round"/></g>
    </g>
    <g class="arms-crossed">
      <path class="sleeve" d="M74 336 Q140 312 214 300" fill="none" stroke="#1d1420" stroke-width="24" stroke-linecap="round"/>
      <path class="sleeve" d="M226 336 Q160 312 86 300" fill="none" stroke="#2c1f31" stroke-width="24" stroke-linecap="round"/>
      <ellipse cx="216" cy="298" rx="11" ry="9" fill="url(#skin)"/><ellipse cx="84" cy="298" rx="11" ry="9" fill="url(#skin)"/>
    </g>
    <path class="wink-r" d="M159 146 Q173 136 186 144" transform="translate(150 145) scale(1.14) translate(-150 -145)" fill="none" stroke="#3a0a16" stroke-width="3.4" stroke-linecap="round"/>

    <!-- night-time zzz -->
    <g class="zzz" fill="#e3b866" font-family="Georgia, serif" font-weight="bold">
      <text x="214" y="86" font-size="16">z</text><text x="228" y="68" font-size="20">z</text><text x="246" y="46" font-size="26">Z</text>
    </g>
  </svg>
  <div class="hearts" aria-hidden="true"></div>`;

  const svg = stage.querySelector('.rias');
  const hearts = stage.querySelector('.hearts');
  let mood = 'neutral';
  let talkTimer = 0;
  let blinkTimer = 0;

  function setMood(m) {
    mood = m;
    svg.dataset.mood = m;
  }

  // Natural blinking: every 2.5-6 seconds, sometimes a double blink.
  function scheduleBlink() {
    clearTimeout(blinkTimer);
    blinkTimer = setTimeout(() => {
      if (mood !== 'happy' && mood !== 'sleepy') {
        svg.classList.add('blink');
        setTimeout(() => svg.classList.remove('blink'), 140);
        if (Math.random() < 0.2) setTimeout(() => { svg.classList.add('blink'); setTimeout(() => svg.classList.remove('blink'), 120); }, 320);
      }
      scheduleBlink();
    }, 2500 + Math.random() * 3500);
  }
  scheduleBlink();

  // Mouth flaps between shapes while she talks.
  function talk(ms) {
    clearInterval(talkTimer);
    svg.classList.add('talking');
    const shapes = ['open', 'o', 'open', 'smile'];
    let i = 0;
    talkTimer = setInterval(() => { svg.dataset.mouth = shapes[i++ % shapes.length]; }, 130);
    setTimeout(stopTalking, Math.max(600, Math.min(ms, 12000)));
  }
  function stopTalking() {
    clearInterval(talkTimer);
    svg.classList.remove('talking');
    delete svg.dataset.mouth;
  }

  // Tap: a little hop and a few hearts.
  function react() {
    svg.classList.remove('hop');
    void svg.getBoundingClientRect();
    svg.classList.add('hop');
    for (let i = 0; i < 5; i++) {
      const h = document.createElement('span');
      h.textContent = Math.random() < 0.5 ? '♥' : '✦';
      h.style.left = `${35 + Math.random() * 30}%`;
      h.style.animationDelay = `${i * 90}ms`;
      h.style.fontSize = `${14 + Math.random() * 12}px`;
      hearts.append(h);
      setTimeout(() => h.remove(), 1600 + i * 90);
    }
  }

  // A short gesture: 'wave', 'wink' or 'crossed' (arms folded, unimpressed).
  let gestureTimer = 0;
  function gesture(name, ms = 2400) {
    clearTimeout(gestureTimer);
    svg.classList.remove('wave', 'wink', 'crossed');
    void svg.getBoundingClientRect();
    svg.classList.add(name);
    gestureTimer = setTimeout(() => svg.classList.remove(name), ms);
  }
  // Outfits: 'uniform', 'pajamas', 'winter', 'summer'.
  function setOutfit(name) { svg.dataset.outfit = name || 'uniform'; }

  setMood('neutral');
  setOutfit('uniform');
  return { talk, stopTalking, setMood, react, gesture, setOutfit, get mood() { return mood; } };
};
