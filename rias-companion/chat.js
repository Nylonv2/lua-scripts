// Rias's conversation engine: matches what you say to a topic, remembers a few things
// about you, follows up on questions she asked, and avoids repeating herself.
window.createRiasChat = function createRiasChat(api) {
  'use strict';
  const T = window.RIAS_TALK;
  const mem = api.memory(); // persisted: { awaiting, recent, likes, mood }
  mem.recent ||= [];
  mem.likes ||= [];

  const norm = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim()
    .replace(/\bi am\b/g, "i'm").replace(/\bim\b/g, "i'm").replace(/\byou are\b/g, "you're");

  // Pick a line she hasn't used recently.
  function pick(pool) {
    const fresh = pool.filter((l) => !mem.recent.includes(JSON.stringify(l)));
    const line = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length || pool.length))];
    mem.recent.push(JSON.stringify(line));
    if (mem.recent.length > 60) mem.recent.splice(0, mem.recent.length - 60);
    return line;
  }
  const fill = (s) => api.say(s)
    .replaceAll('{praise}', api.praiseWord())
    .replaceAll('{like}', mem.likes.length ? mem.likes[Math.floor(Math.random() * mem.likes.length)] : 'spending time with me');
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const out = (pool) => [].concat(pick(pool)).map((l) => cap(fill(l)));

  // Did one of her messages just ask how you are?
  function noteRias(text) {
    // Only ever sets; reply() clears it once you've answered.
    if (/how are you|how about you|what about you|how('s| is) your (day|heart)|how (did|was) (today|your day)|how are you feeling|tell me honestly|how's the day|how's the day treating you/i.test(text)) mem.awaiting = 'feeling';
    else if (/\?/.test(text) && /\b(have you|did you|are you)\b/i.test(text) && mem.awaiting !== 'feeling') mem.awaiting = 'yesno';
  }

  const POS = /\b(good|great|fine|okay|ok|alright|awesome|amazing|happy|well|better|fantastic|wonderful|excellent|not bad|pretty good|chillin|chilling|blessed)\b/;
  const NEG = /\b(bad|awful|terrible|sad|shit|shitty|crap|rough|sucks|sucky|horrible|depressed|down|meh|not (good|great|well|okay|ok|fine)|stressed|tired|exhausted|sick|lonely|angry|mad|upset|anxious|hate)\b/;
  const MEH = /\b(meh|so so|so-so|eh|idk|i don't know|alright i guess|okay i guess|ok i guess|could be better|nothing special|same)\b/;

  function feelingReply(t) {
    if (MEH.test(t)) { mem.mood = 'meh'; return out(T.feeling.meh); }
    if (NEG.test(t)) { mem.mood = 'bad'; return out(T.feeling.bad); }
    if (POS.test(t)) { mem.mood = 'good'; return out(T.feeling.good); }
    return null;
  }

  // Topics, checked in order. First match wins.
  const topics = [
    [/\b(fuck me|sex|nude|naked|horny|boobs|tits|strip|make out with me)\b/, () => out(T.tooFar)],
    [/\b(are you (a )?(real|bot|robot|ai|program|fake)|you're (a )?(bot|ai|fake|not real))\b/, () => out(T.real)],
    [/\b(can't sleep|cant sleep|insomnia|trouble sleeping|not sleepy)\b/, () => out(T.cantSleep)],
    [/\b(good ?night|nighty night|going to (bed|sleep)|heading to bed|gonna sleep|time for bed)\b/, () => out(T.goodnight)],
    [/\b(bye|goodbye|see you|see ya|talk later|ttyl|gotta go)\b/, () => out(T.bye)],
    [/\b(how are you|how're you|how r u|how are u|hru|how have you been|how you doing|how's it going|you okay)\b/, () => { mem.awaiting = 'feeling'; return out(T.howAreYou); }],
    [/\b(what are you doing|what're you doing|wyd|what you doing|what are you up to|whatcha doing)\b/, () => out(T.whatDoing)],
    [/\b(i miss you|i missed you|miss you|missed you)\b/, () => out(T.missYou)],
    [/\b(i love you|love you|ily|i'm in love with you)\b/, () => out(T.loveYou)],
    [/\b(kiss)\b/, () => out(T.kiss)],
    [/\b(hug|cuddle|hold me)\b/, () => out(T.hug)],
    [/\b(date|go out with me)\b/, () => out(T.date)],
    [/\b(you're|you are|ur|you look|youre) (so )?(beautiful|pretty|cute|gorgeous|hot|amazing|perfect|stunning|the best)\b|\b(beautiful|gorgeous|stunning)\b/, () => out(T.compliment)],
    [/\b(girlfriend|my crush|this girl|a girl|another girl|other girl|she's cute|dating someone)\b/, () => out(T.jealous)],
    [/\bakeno\b/, () => out(T.about.akeno)],
    [/\b(issei|ise|your pawn|hyoudou)\b/, () => out(T.about.issei)],
    [/\b(peerage|koneko|kiba|asia|xenovia|gasper|your servants)\b/, () => out(T.about.peerage)],
    [/\b(sirzechs|your brother|grayfia|your family|your mom|your dad|your parents|venelana)\b/, () => out(T.about.family)],
    [/\b(chess)\b/, () => out(T.about.chess)],
    [/\b(power|destruction|devil|demon|magic)\b/, () => out(T.about.powers)],
    [/\b(your hair|red hair|crimson)\b/, () => out(T.about.hair)],
    [/\b(kuoh|occult research|your school|your club)\b/, () => out(T.about.school)],
    [/\b(favorite food|favourite food|what do you eat|do you like (food|sushi|ramen))\b/, () => out(T.about.food)],
    [/\b(hobby|hobbies|what do you like|for fun|anime|manga|japan)\b/, () => out(T.about.hobby)],
    [/\b(who are you|tell me about (yourself|you)|about you)\b/, () => out([].concat(T.about.hair, T.about.school))],
    [/\b(sick|ill|fever|flu|headache|migraine|stomach ?ache|throwing up|nauseous)\b/, () => out(T.sick)],
    [/\b(lonely|alone|no friends|nobody cares|no one cares)\b/, () => out(T.lonely)],
    [/\b(sad|depressed|crying|cry|upset|heartbroken|hurt|miserable|down bad|feel down|feeling down)\b/, () => { mem.mood = 'bad'; return out(T.sad); }],
    [/\b(stress|stressed|anxious|anxiety|overwhelm|overwhelmed|panic|too much|nervous|worried)\b/, () => out(T.stressed)],
    [/\b(angry|mad|pissed|annoyed|furious|hate)\b/, () => out(T.angry)],
    [/\b(tired|sleepy|exhausted|no energy|drained|worn out)\b/, () => out(T.tired)],
    [/\b(hungry|starving|food|eat|eating|snack|dinner|lunch|breakfast)\b/, () => out(T.hungry)],
    [/\b(bored|boring|nothing to do)\b/, () => out(T.bored)],
    [/\b(i failed|failed|messed up|screwed up|fucked up|i suck|i'm useless|im useless|i'm a failure|i lost)\b/, () => out(T.failed)],
    [/\b(i did it|i finished|i got (the|a) job|passed|i won|promotion|proud of me|accomplished)\b/, () => out(T.proud)],
    [/\b(happy|excited|great day|best day|amazing day|so good|let's go|lets go)\b/, () => { mem.mood = 'good'; return out(T.happy); }],
    [/\b(i'm home|i'm back|got home|back home|home now|just got back)\b/, () => out(T.backHome)],
    [/\b(going out|heading out|leaving|on my way|going to (the )?(store|party|mall))\b/, () => out(T.leaving)],
    [/\b(work|job|shift|boss|office)\b/, () => out(T.work)],
    [/\b(study|studying|homework|exam|test|class|school|college|assignment)\b/, () => out(T.study)],
    [/\b(game|gaming|playing|xbox|playstation|ps5|switch|fortnite|valorant|minecraft)\b/, () => out(T.gaming)],
    [/\b(gym|workout|work out|exercise|lifting|run|running|training)\b/, () => out(T.workout)],
    [/\b(sorry|my bad|apologize)\b/, () => out(T.sorry)],
    [/\b(thank|thanks|thx|tysm|appreciate)\b/, () => out(T.thanks)],
    [/\b(joke|funny|make me laugh|tell me a story|tell me something)\b/, () => out(T.joke)],
    [/\b(motivat\w*|give up|can't do (it|this)|cant do (it|this)|encourage|push me|i'm lazy|im lazy)\b/, () => out(T.motivate)],
  ];

  function reply(raw) {
    const t = norm(raw);

    // "I like X" / "my favorite X is Y": remember it.
    const like = t.match(/\b(?:i (?:really )?(?:like|love|enjoy)|my fav(?:ou?rite)? (?:\w+ )?is) ([a-z0-9 '\-]{2,40})/);
    if (like && !/\b(you|your|yours|rias|her)\b/.test(like[1])) {
      const thing = like[1].replace(/\b(a lot|so much|very much|too)\b/g, '').trim();
      if (thing && !mem.likes.includes(thing)) mem.likes.push(thing);
      if (mem.likes.length > 20) mem.likes.shift();
      return out(T.remembered);
    }
    if (/\bwhat do i (like|love)\b|\bremember what i like\b/.test(t)) {
      return mem.likes.length ? out(T.recallLike) : [fill("You haven't told me yet, {name}. Tell me something you like.")];
    }

    // Following up on her own question.
    const awaiting = mem.awaiting;
    mem.awaiting = null;
    if (awaiting === 'feeling') {
      const r = feelingReply(t);
      if (r) return r;
    }
    if (awaiting === 'yesno') {
      if (/^(yes|yeah|yep|yup|ya|i did|i have|sure|of course)\b/.test(t)) return out(T.yes);
      if (/^(no|nope|nah|not yet|i didn't|i haven't)\b/.test(t)) return out(T.no);
    }

    // Greetings, by time of day (and keep going if there's more after "hi").
    const greet = /^(hi|hey|hello|heya|hiya|yo|sup|what's up|whats up|good (morning|afternoon|evening)|morning|evening)\b[\s,!.]*/;
    if (greet.test(t)) {
      let rest = t;
      while (greet.test(rest)) rest = rest.replace(greet, ''); // "yo what's up" is one hello
      rest = rest.replace(/^(rias|babe|baby|love|princess|president|buchou)\b[\s,!.]*/, '').trim();
      const hello = out(T.greet[api.period()] || T.greet.evening);
      if (rest.length > 3) {
        const more = reply(rest);
        return [hello[0]].concat(more);
      }
      return hello;
    }

    for (const [re, fn] of topics) if (re.test(t)) return fn();

    // Plain "I'm good / I'm not great" without her asking.
    if (/^(i'm|im|i am|i feel|feeling|i've been)\b/.test(t)) {
      const r = feelingReply(t);
      if (r) return r;
    }
    if (/\?$/.test(t)) return out(T.questionBack);
    return out(T.fallback);
  }

  return { reply, noteRias };
};
