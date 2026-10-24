// Everything Rias says lives here, so it's easy to tweak her voice.
// {name} = what she calls you, {title} = the task title.
window.RIAS = {
  due: {
    wake: [
      "Good morning, {name}. Up you get — a member of the Gremory household doesn't sleep through the sunrise.",
      "Rise and shine, {name}. Open the curtains and let some light in. I'll wait.",
      "Morning~ I've been up for a while, you know. Sit up and stretch for me, {name}.",
    ],
    water: [
      "{name}, have a glass of water. Now, please — not 'in a minute'.",
      "Hydration check! Even devils need water. Go drink something for me.",
      "I'm ordering you to drink some water. Consider it a Gremory decree.",
    ],
    meal: [
      "It's time to eat, {name}. A proper meal — not just snacks. I'll know.",
      "Akeno would scold you for skipping meals, and so would I. Go eat something good.",
      "Food time. Sit down, eat slowly, and actually enjoy it. You've earned it.",
    ],
    exercise: [
      "Let's get moving, {name}. A walk or some stretching — a strong servant is a happy one.",
      "Training time! Koneko does hers without complaining, you know. Just fifteen minutes.",
      "Shoes on. Fresh air and a bit of movement will clear your head, I promise.",
    ],
    work: [
      "Time to focus, {name}. Put your phone face down and give this your best. I'll be right here.",
      "Study session. Even I had to keep my grades up at Kuoh Academy. Let's do this together.",
      "Focus block starts now. One task at a time — that's how I plan my moves.",
    ],
    break: [
      "You've been at it a while. Stand up, roll your shoulders, and rest your eyes for a moment.",
      "Break time, {name}. Step away from the screen. The work will still be there in ten minutes.",
      "Pause. Stretch your arms over your head… there. Doesn't that feel better?",
    ],
    hygiene: [
      "Go freshen up, {name}. You'll feel like a new person, I promise.",
      "Teeth, face, hair — take care of yourself. You represent my household, after all.",
      "A quick shower works wonders. Off you go~",
    ],
    meds: [
      "{name}, it's time for your medication. Don't skip it — your health matters to me.",
      "Medicine reminder. Take it with some water, please.",
    ],
    social: [
      "Why not message someone you care about? Even a short hello. Bonds are what make a peerage strong.",
      "Reach out to a friend today, {name}. You'd be surprised how much it means to them.",
    ],
    chores: [
      "A little tidying, {name}. Ten minutes now saves you an hour later.",
      "Chore time. Put on some music and get it done — I'll be impressed.",
    ],
    wind: [
      "The day is winding down. Dim the lights, and let's start putting the screens away.",
      "Evening, {name}. Time to slow down. Maybe some tea, a book, a warm shower?",
    ],
    sleep: [
      "It's bedtime, {name}. Phone down, eyes closed. I'll see you in the morning.",
      "Lights out. You did enough today. Rest well — that's an order from me.",
      "Go to sleep, {name}. A well-rested servant is worth ten tired ones. Goodnight~",
    ],
    workLeave: [
      "Time to head out, {name}. {title} — grab your keys, your water, and go. Don't be late on my account.",
      "Leave now and you'll arrive calm instead of rushing. Shoes on~",
      "Off you go to work. Do your best — I'll be here when you get back.",
    ],
    workStart: [
      "Your shift is starting. Focus, work hard, and take your breaks. That's an order.",
      "Work time, {name}. Show them what a member of the Gremory household can do.",
    ],
    workEnd: [
      "Your shift is over! Well done, {name}. Come home and rest.",
      "Clocking out? Good. You've earned a proper meal and a quiet evening.",
    ],
    calendar: [
      "From your calendar: {title}. Don't forget~",
      "{name}, {title} is coming up. Be ready.",
    ],
    custom: [
      "{name}, you asked me to remind you: {title}.",
      "Don't forget — {title}. I believe in you.",
      "It's time for {title}. Let's not keep it waiting, hm?",
    ],
  },

  // Food diary reactions and nudges.
  food: {
    healthy: [
      "Look at you, eating properly. That's my {praise}.",
      "Good choice. Your body will thank you — and so do I.",
      "Healthy and delicious? I approve.",
    ],
    normal: [
      "Noted. Thank you for telling me what you ate.",
      "Good — a fed servant is a happy servant.",
      "Logged. Don't forget some water with it.",
    ],
    treat: [
      "A treat? Fine, you've earned it. Just don't make it every meal~",
      "Ufufu, I won't scold you this time. Balance it out later, okay?",
      "Sweets and snacks happen. I'm just glad you told me.",
    ],
    ask: [
      "What did you have, {name}? Tell me so I can keep track.",
      "Done eating? Log it for me — I like knowing you're eating well.",
    ],
    nudge: [
      "You haven't told me what you had for dinner, {name}. Did you eat? Log it for me.",
      "I don't see dinner in your food diary. Don't tell me you skipped it…",
    ],
  },
  water: {
    nudge: [
      "You've only had {count} glasses of water today. Go drink one. Now~",
      "Hydration check: {count} glasses so far. That's not enough for my servant.",
    ],
    goal: [
      "That's your water goal for today! Good job, {name}.",
      "All your water for the day. I'm impressed.",
    ],
  },

  done: [
    "Well done, {name}. That's my cute servant.",
    "Perfect. I knew I could count on you.",
    "Ufufu~ See? That wasn't so hard.",
    "Excellent work. I'm proud of you — truly.",
    "Good. Keep this up and you'll be the strongest in my peerage.",
    "That's the spirit, {name}.",
  ],
  snooze: [
    "Fine, ten more minutes. But I'm coming back for you.",
    "Alright… ten minutes. Don't make me come looking.",
    "I'll allow it — just this once. Ten minutes, {name}.",
  ],
  // Praise, picked by the "Rias calls you" setting. Mixed into done reactions,
  // check-ins (once you've done something that day) and chat.
  praise: {
    boy: [
      "Good boy, {name}. I knew you could do it.",
      "That's my good boy. Keep it up~",
      "Ufufu, such a good boy. You make me proud.",
      "Look at you getting things done. Good boy.",
      "Good boy. Come here — you've earned a pat on the head.",
      "See? You're a good boy when you want to be~",
      "Mm, good boy. I could get used to this.",
    ],
    girl: [
      "Good girl, {name}. I knew you could do it.",
      "That's my good girl. Keep it up~",
      "Ufufu, such a good girl. You make me proud.",
      "Look at you getting things done. Good girl.",
      "Good girl. Come here — you've earned a pat on the head.",
      "See? You're a good girl when you want to be~",
      "Mm, good girl. I could get used to this.",
    ],
    neutral: [
      "Good job, {name}. I knew you could do it.",
      "That's my cute servant. Keep it up~",
      "Ufufu, well done. You make me proud.",
      "Look at you getting things done. I'm impressed.",
      "Well done. Come here — you've earned a pat on the head.",
      "See? You're wonderful when you want to be~",
    ],
  },
  praiseCheckin: {
    boy: [
      "Just checking in. You've been doing so well today, {name}. Good boy.",
      "I've been watching you keep up with your day. Such a good boy~ Don't stop now.",
      "Thinking about you. You've been a very good boy today — drink some water for me, okay?",
    ],
    girl: [
      "Just checking in. You've been doing so well today, {name}. Good girl.",
      "I've been watching you keep up with your day. Such a good girl~ Don't stop now.",
      "Thinking about you. You've been a very good girl today — drink some water for me, okay?",
    ],
    neutral: [
      "Just checking in. You've been doing so well today, {name}.",
      "I've been watching you keep up with your day. I'm proud of you~ Don't stop now.",
      "Thinking about you. You've been wonderful today — drink some water for me, okay?",
    ],
  },
  skip: [
    "Alright, we'll let this one go. We'll try again tomorrow, together.",
    "Not today? That's okay. Just don't make a habit of it.",
    "Skipped. I'm not angry — rest if you need it.",
  ],
  allDone: [
    "Everything on today's list is done. I'm genuinely impressed, {name}. Come here — you've earned some praise.",
    "A perfect day! I couldn't be prouder.",
  ],

  greet: {
    morning: [
      "Good morning, {name}~ Did you sleep well?",
      "Ah, you're up. Good morning, {name}.",
    ],
    afternoon: [
      "Good afternoon, {name}. How's the day treating you?",
      "There you are. I was starting to wonder where you'd gone.",
    ],
    evening: [
      "Good evening, {name}. Tell me about your day.",
      "Welcome back, {name}. Come, sit with me for a moment.",
    ],
    night: [
      "It's late, {name}. Shouldn't you be asleep?",
      "Still awake? Hmm… don't stay up too long, okay?",
    ],
  },

  checkin: {
    morning: [
      "How are you feeling this morning, {name}? Tell me honestly.",
      "Have you had any water yet today?",
      "What's the one thing you want to get done this morning? Say it, and it's a promise.",
    ],
    afternoon: [
      "Quick posture check — shoulders down, back straight. There.",
      "Take three slow breaths with me. In… and out. Good.",
      "Look away from the screen for twenty seconds. Find something far away and focus on it.",
      "Have you had water in the last hour, {name}?",
      "I was just thinking about you. Are you keeping up with your plans?",
    ],
    evening: [
      "How did today go, {name}? Even small wins count.",
      "Have you eaten properly today? Don't lie to me.",
      "Start thinking about tomorrow — what's the first thing you'll do when you wake up?",
    ],
  },

  lateNight: [
    "It's late, {name}. Whatever it is, it can wait until morning. Go to sleep.",
    "You should be in bed. I'll still be here tomorrow, I promise.",
  ],

  chat: {
    // Everything else she says in chat lives in talk.js.
    crisis: [
      "{name}, I'm really glad you told me, and I want you safe. Please reach out to someone right now — a person you trust, or a crisis line. In the US you can call or text 988; elsewhere, findahelpline.com lists free local lines. You matter to me.",
    ],
  },
};
