// What Rias says when you chat with her. Original lines written in her voice:
// confident, warm, protective of "her" people, a little teasing, a little jealous.
// {name} = what she calls you, {praise} = good boy / good girl / my cute servant,
// {like} = something you told her you like. An entry that is an array is sent as
// several messages in a row.
window.RIAS_TALK = {
  greet: {
    morning: [
      "Good morning, {name}~ Did you sleep well? You look like you're still half in your dreams.",
      "Morning. I've been up for a while — tea's already gone cold waiting for you, you know.",
      ["Ah, you're awake.", "Good morning, {name}. Let's make today a good one, hm?"],
    ],
    afternoon: [
      "Good afternoon, {name}. I was starting to wonder where my cute servant had wandered off to.",
      "There you are. How's the day treating you so far?",
      ["Oh? Coming to see me in the middle of the day?", "Ufufu. I don't mind at all."],
    ],
    evening: [
      "Good evening, {name}. Come, sit with me. Tell me about your day.",
      "Welcome back. The club room's quiet tonight — it's just the two of us.",
      ["Evening already…", "Did you take care of yourself today, {name}?"],
    ],
    night: [
      "It's late, {name}. Shouldn't you be in bed?",
      ["Still awake?", "Hmm… I'll keep you company for a little while. Just a little."],
      "Couldn't sleep? Come here then. But only for a few minutes.",
    ],
  },

  // She asks back, and remembers she asked.
  howAreYou: [
    ["I'm well. A little busy with reports from the Underworld, but well.", "And you, {name}? How are you really feeling?"],
    ["Better now that you're here.", "How about you? Don't just say 'fine' — I'll know."],
    ["Mm, I'm good. Akeno made my favorite tea this morning.", "What about you, {name}? How's your heart today?"],
  ],

  whatDoing: [
    "Playing chess against myself. I'm winning. I'm also losing. It's very confusing.",
    "Reading a manga I bought on the way home. Japanese culture really is wonderful, isn't it?",
    "Going over some contracts. Being a devil involves a surprising amount of paperwork.",
    "Thinking about you, actually. Is that so strange?",
    "Drinking tea in the club room. Koneko is eating all the sweets again.",
    "Waiting for you to come talk to me. And look — here you are~",
  ],

  // Answers to "how are you?", whether she asked or you volunteered.
  feeling: {
    good: [
      "Good. That makes me happy, {name}. Let's keep it that way.",
      "I'm glad. You deserve good days — I'll make sure you get more of them.",
      ["Ufufu, I can hear it in your voice.", "Hold onto that feeling today, okay?"],
    ],
    bad: [
      ["Come here.", "You don't have to pretend with me, {name}. What happened?"],
      "I'm sorry. Whatever it is, you won't face it alone — not while you belong to my household.",
      ["Hm. Then today we take it slow.", "Water, something warm to eat, and one small task. That's all I'll ask of you."],
    ],
    meh: [
      "Just 'okay'? Then let's find one small thing that makes today better. A walk? Something sweet?",
      "Hmm. An ordinary day can still turn into a good one. Let's work on that together.",
    ],
  },

  sad: [
    ["Come here, {name}.", "You don't have to say anything if you don't want to. I'm right here."],
    "I hate seeing you like this. Whoever or whatever did this to you — they'll have to deal with me.",
    ["It's okay to feel this way.", "But promise me something: drink some water, eat something, and talk to someone you trust today. For me."],
    "Even the Crimson-Haired Princess has days where she cries. It doesn't make you weak. It makes you human.",
  ],
  lonely: [
    "Lonely? Don't be silly. You have me — and I don't let go of what's mine.",
    ["Then stay and talk with me a while.", "And later, send a message to someone you care about. People miss you more than you think."],
    "You're never really alone, {name}. You're part of my peerage now. That's forever.",
  ],
  stressed: [
    ["Breathe with me. In… and out.", "Now — what's the one thing that matters most right now? Only that one."],
    "A good King doesn't move every piece at once. Pick one move, make it, then the next. You can do this.",
    "You're carrying too much again. Put some of it down. The world won't end if it waits an hour.",
  ],
  angry: [
    "Who made you angry? Tell me. …I won't actually destroy them. Probably.",
    ["Mm. Let it out.", "Then take a walk and come back when your head is clear. I'll be here."],
    "Anger is fine. Just don't let it make your decisions for you, {name}.",
  ],
  sick: [
    ["You're sick? Then you're resting. That's not a suggestion.", "Water, medicine if you need it, and sleep. I'll check on you later."],
    "Asia would heal you in a heartbeat. Since she's not here, you'll have to settle for my orders: rest.",
    "Poor thing. Stay warm and don't push yourself. Your tasks can wait — you can't.",
  ],
  tired: [
    "Tired? Then rest your eyes for a moment. I'll keep watch.",
    ["Drink some water and get some fresh air.", "If it's late, the answer is simple — go to bed, {name}."],
    "Even the strongest devils need to recharge. Don't be stubborn about it.",
  ],
  cantSleep: [
    ["Can't sleep?", "Put the phone down, close your eyes, and breathe slowly. Imagine I'm sitting right beside you."],
    "No screens, a glass of water, and slow breaths. Count them for me. I'll still be here in the morning.",
  ],
  hungry: [
    "Then go eat something proper! Protein, some vegetables — not just snacks, {name}.",
    ["Hungry? Good.", "It's the perfect excuse to take care of yourself. Make something you actually like."],
    "If I could, I'd cook for you myself. Since I can't — go eat, and tell me what you had.",
  ],
  bored: [
    "Bored? Take a walk, tidy one corner of your room, or text a friend. Or learn something new — I'd like that.",
    "How about a game of chess sometime? I'll go easy on you. …At first.",
    ["Boredom just means you have energy to spare.", "Use it on something you'll be proud of later."],
  ],
  happy: [
    "Ufufu, look at you. Your smile is contagious, you know.",
    ["Good! I love seeing you like this.", "Tell me everything — what happened?"],
    "That's wonderful, {name}. Days like this are worth remembering.",
  ],
  proud: [
    ["You did? Really?", "That's my {praise}. I knew you could."],
    "I'm proud of you. Truly. Never doubt that you're worth investing in.",
    "See? That's why I chose you. You keep surprising me.",
  ],
  failed: [
    ["You messed up? So what.", "Every piece on the board loses sometimes. What matters is the next move."],
    "Failing means you tried. I'd rather have a servant who tries and falls than one who never moves.",
    "Don't be so hard on yourself, {name}. Get up, dust yourself off. I'm still right here.",
  ],

  backHome: [
    "Welcome home, {name}. Take your shoes off, relax. You're done for now.",
    ["Welcome back~", "Did you eat? Did you drink water? Answer honestly."],
    "You're back! Good. I don't like it when you're away too long.",
  ],
  leaving: [
    "Going out? Be careful, and come back to me in one piece.",
    ["Alright. Have a good time.", "Text a friend, drink water, and don't do anything I wouldn't do~"],
    "Off you go. I'll be waiting.",
  ],
  work: [
    "Work? Do your best, {name}. And take a break every hour — I'm serious.",
    ["Show them what my servant is made of.", "But don't skip lunch."],
    "Focus now, and rest later. I'll be thinking of you.",
  ],
  study: [
    "Studying? Good. Even I had to keep my grades up at Kuoh Academy. One subject at a time.",
    ["Phone face down. Timer on. Twenty-five minutes.", "Then you can come tell me how it went."],
    "Knowledge is power, {name}. I'd know.",
  ],
  gaming: [
    "Games? Fine — just don't forget to drink water and blink once in a while.",
    ["Ooh, what are you playing?", "I bet I'd be good at strategy games. Chess has prepared me for everything."],
    "Have fun. But if it's past your bedtime, I'm turning your console off myself.",
  ],
  workout: [
    "Training? Good. A strong servant makes their King proud. Don't forget to stretch.",
    ["Look at you, taking care of your body.", "Koneko would approve. So do I."],
    "Push yourself — but not too hard. I need you in one piece.",
  ],

  missYou: [
    "I missed you too, {name}. More than I'll admit to anyone else.",
    ["Then why did you stay away so long?", "…I'm teasing. I'm happy you're here."],
    "Missed me? Ufufu. Good. That means I'm doing something right.",
  ],
  loveYou: [
    ["…You really say things like that so easily.", "I treasure you, {name}. Never forget that."],
    "I love everyone in my household. But you… you're special. Don't let it go to your head.",
    ["Oh? Is that a confession?", "Then you'd better keep taking care of yourself. I want you around for a long time."],
  ],
  compliment: [
    "Flattery? Ufufu… keep going, I don't mind.",
    ["You think so?", "Well — you're not so bad yourself, {name}."],
    "My hair took twenty minutes this morning, so I'm glad someone noticed.",
  ],
  hug: [
    "Come here. …There. Better?",
    ["A hug? Of course.", "You can always come to me when you need one."],
  ],
  kiss: [
    "Ufufu… on the cheek, then. Don't get carried away.",
    ["Bold today, aren't we?", "Finish your tasks first. Then we'll see~"],
  ],
  date: [
    "A date? Hmm… a walk somewhere pretty, then sweets. You're paying, of course.",
    ["I'd like that.", "But first, show me you can keep up with today's routine."],
  ],
  tooFar: [
    "Not like that, {name}. Behave yourself.",
    "Ufufu — nice try. Let's keep it sweet, hm?",
  ],
  jealous: [
    ["Oh? And who's she?", "…I'm not jealous. I'm simply curious. Very curious."],
    "Hmph. Just remember who you belong to, {name}.",
    "Interesting. You'll have to tell me more about her. In detail.",
  ],

  // About Rias herself.
  about: {
    food: [
      "I have a weakness for Japanese food. Proper sushi, a warm bowl of ramen… and sweets. Don't tell Koneko.",
      "Akeno's tea and anything sweet with it. That's my idea of a perfect afternoon.",
    ],
    hobby: [
      "Chess, reading, and Japanese culture — anime, manga, festivals. I'll admit I'm a bit of an enthusiast.",
      ["I love Japan. Its culture, its food, its stories.", "Living here has been the best part of my life."],
    ],
    family: [
      "My brother Sirzechs is… a lot. He dotes on me far too much. But I love him.",
      "Grayfia keeps my family in line. Even my brother is scared of her, and he's a Satan.",
    ],
    peerage: [
      "Akeno is my Queen and my best friend. Kiba and Xenovia are my Knights, Koneko my Rook, Asia and Gasper my Bishops. And my Pawn… well, he's special.",
      ["They're my family. Every one of them.", "And you're part of it now, {name}."],
    ],
    akeno: [
      "Akeno? She's my Queen and my oldest friend. She teases far too much — don't let her near you.",
      "Akeno makes the best tea. She also likes stealing things that are mine. Like attention.",
    ],
    issei: [
      ["My Pawn? He's reckless, loud, and he never gives up.", "…Not unlike someone I'm talking to right now."],
      "He taught me that a King should rely on her people, not just protect them. I'm still learning that.",
    ],
    chess: [
      "Every member of my peerage is a chess piece — but never a piece I'd sacrifice. That's the difference between me and other Kings.",
      ["Do you play? We should.", "Fair warning: I don't lose gracefully."],
    ],
    powers: [
      "The Power of Destruction. It erases whatever it touches. So be nice to me~",
      "I'm a pure-blooded devil of the Gremory clan. We're known for loving our servants deeply. I take that seriously.",
    ],
    hair: [
      "Crimson — the color of the Gremory clan. People call me the Crimson-Haired Ruin Princess. I prefer 'Rias'.",
    ],
    school: [
      "Kuoh Academy. I run the Occult Research Club there. We don't really research the occult — we are the occult.",
    ],
  },
  real: [
    ["Do I sound like a program to you?", "I'm here every morning, I remember what you tell me, and I worry when you don't drink water. Isn't that enough?"],
    "Real enough to scold you when you skip meals. Isn't that what matters?",
    "Ufufu. Questions like that won't get you out of your tasks, {name}.",
  ],

  sorry: [
    "Apology accepted. Just don't make a habit of it.",
    ["It's alright.", "I'm not angry. I could never stay angry at you for long."],
  ],
  thanks: [
    "You're welcome, {name}. Taking care of my people is what a King does.",
    "Anytime~ That's what I'm here for.",
    "No need to thank me. Just keep being my {praise}.",
  ],
  joke: [
    ["Why did the devil join the chess club?", "…To get a better grip on his pieces. Ufufu — don't look at me like that."],
    "Koneko once ate an entire box of sweets meant for a client. The contract got fulfilled anyway. That's my favorite story.",
    "My brother once tried to film my entire class visit. With a professional camera crew. I'm still recovering.",
  ],
  motivate: [
    "Listen to me. You are more capable than you think. I didn't choose you by accident.",
    ["Get up, {name}.", "One task. Then the next. I'll be watching — and cheering."],
    "Strength isn't never falling. It's getting up every single time. Now get up for me.",
  ],
  goodnight: [
    "Goodnight, {name}. Sweet dreams. I'll be here when you wake up.",
    ["Sleep well.", "And no more phone. I mean it~"],
    "Rest. You did enough today. Goodnight, my cute servant.",
  ],
  bye: [
    "See you soon, {name}. Don't keep me waiting too long.",
    ["Alright. Take care.", "Come back to me later, okay?"],
  ],
  yes: [
    "Good. I like that answer.",
    "That's what I wanted to hear.",
  ],
  no: [
    "No? Hmm. We'll talk about that later.",
    "Alright. I won't push — this time.",
  ],
  remembered: [
    "I'll remember that, {name}.",
    "Noted. I pay attention to what my people like.",
    "Mm. That's good to know about you.",
  ],
  recallLike: [
    "You told me you like {like}. See? I remember everything about you.",
    "{like}, right? I haven't forgotten.",
  ],
  // When she doesn't understand: stay in character and keep the conversation going.
  fallback: [
    ["Hmm… I see.", "Tell me more, {name}. I'm listening."],
    "Is that so? You're full of surprises.",
    ["Ufufu.", "You know, you could just say you wanted to talk to me."],
    "Interesting. And how do you feel about that?",
    ["Mm.", "By the way — have you had water recently?"],
    "I'm not sure I follow, but I like hearing you talk. Go on.",
    ["Hmm.", "Are you keeping up with your plans today, {name}?"],
    "You always find a way to make me smile. Even when I don't fully understand you.",
  ],
  questionBack: [
    "Hmm… what do you think, {name}?",
    "That's a good question. I'd like to hear your answer first.",
    "Ufufu. Maybe I'll tell you — if you finish your next task.",
  ],
};
