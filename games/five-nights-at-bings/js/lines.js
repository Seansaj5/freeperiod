// Every spoken line in the game. Each one is shown as a caption and (with sound on) read aloud.

export const CALLS = {
  1: [
    'Uh, hey! Sean? Is this thing recording? Okay, good.',
    'Welcome to the night shift at Bing\'s Arcade and Grill. I worked that desk before you, so I\'ll walk you through it.',
    'So, the robots. Bing, Dylan and Gavin. They, uh, wander at night. Something about their motors locking up if they sit still.',
    'Thing is, after midnight they don\'t see a night guard. They see a guest who stayed past closing. And guests who stay past closing get... escorted.',
    'Check your cameras. If one of them shows up at a door, hit the light to be sure, then shut the door. Open it again once they leave.',
    'Doors, lights and cameras all eat power. Run out before six and, well. Don\'t run out.',
    'One more thing. The music box in the Prize Corner. Lana and Laith sleep in there. Keep it wound from the camera.',
    'If the music stops, they wake up. And Sean, if they wake up, you have about fifteen seconds. There is no fixing it.',
    'Okay. You\'ll do great. Talk to you tomorrow.',
  ],
  2: [
    'Hey Sean! Night two. See, I knew you\'d make it.',
    'So I should have told you about Sal. He runs the bar, camera three. He is always holding a bottle.',
    'As long as that bottle has something in it, Sal stays put. When it runs dry, he comes looking for more. And he thinks you have it.',
    'So pull up the bar camera and hold the pour button to top him off. Do it before it hits empty.',
    'If you hear glass break, he is already running. Find which hall he is in and shut that door. Fast.',
    'Also, Dylan messes with the cameras when he moves. If the screen cuts out, that was him.',
    'Keep the box wound. Keep Sal topped off. Easy. Good night, Sean.',
  ],
  3: [
    'Sean, hey. Night three. Most people quit by now, so, respect.',
    'Okay, new problem. Mister Tokens. He is the old prize machine. He was supposed to be scrapped.',
    'He crawls through the vent over your desk. You will hear coins rattling. Camera nine shows the vent.',
    'When he is close, flip the vent seal. It costs power like a door, so open it again when he backs off.',
    'And Bing. Bing is patient. He only moves when you are not watching him. Keep an eye on him and he stays still.',
    'Gavin is heavy. If he leans on your door, he drains the power faster. Don\'t let him sit there all night.',
    'You have got this. See you tomorrow.',
  ],
  4: [
    'Hey. Uh, Sean. Night four.',
    'I\'m going to be honest, they are faster tonight. All of them. Don\'t stare at one camera for long.',
    'Music box, Sal\'s bottle, doors, vent. Make it a loop. Box, bottle, doors, vent.',
    'I, uh. I think something is in the hall outside the day office. It sounds like a bottle rolling.',
    'It\'s probably nothing. Just... if I don\'t call tomorrow, finish the week. Get your certificate.',
    'Good luck, Sean.',
  ],
  5: [
    '...',
    'Closing time, Sean.',
    'The other guard went home. Bing is taking the calls now.',
    'You stayed all week. Bing likes guests who stay.',
    'One more night. Then you can stay forever.',
  ],
  6: [
    'Sean. It\'s me. I\'m okay, I hid in the walk-in fridge all night. Long story.',
    'Listen, management wants one more shift. Overtime. They turned every robot all the way up.',
    'I told them it was a bad idea. They said you were the only one who ever lasted five nights.',
    'So, no advice this time. You know more than I do. Just survive it.',
  ],
};

export const VOICE = {
  bing: {
    move: ['Welcome to Bing\'s.', 'We are closed, Sean.', 'Guests must leave by midnight.', 'I see you watching.'],
    out: ['Closing time, Sean.'],
  },
  dylan: { move: ['One, two, three, four.', 'Wanna hear a solo?', 'Check your cameras, Sean.'] },
  gavin: { move: ['Still hungry.', 'Kitchen\'s open.', 'Is that door locked? I\'m coming in.'] },
  sal: {
    leave: ['My bottle is empty, Sean.', 'Who drank it? Was it you?', 'Last call. I\'m coming to you.'],
    back: ['Fine. One more round.', 'Lucky door.'],
    pour: ['Keep it coming.', 'That\'s the stuff.'],
  },
  tokens: { move: ['Insert coin.', 'Winner. Winner.', 'Claim your prize.'] },
  lana: { wake: ['You stopped the music.'] },
  laith: { wake: ['Now we play.'] },
};

export const NAMES = { bing: 'BING', dylan: 'DYLAN', gavin: 'GAVIN', sal: 'SAL', tokens: 'MR. TOKENS', lana: 'LANA', laith: 'LAITH', twins: 'LANA & LAITH' };

export const TIPS = {
  bing: 'Bing only moves when you are not watching him. Find him on the cameras and keep checking. At the door you can spot his eyes in the dark.',
  dylan: 'Dylan comes down the west hall to the LEFT door. Hit the light, and shut the door if he is there.',
  gavin: 'Gavin comes through the kitchen to the RIGHT door. Hit the light, and shut the door if he is there.',
  sal: 'Sal ran because his bottle went empty. Hold POUR on the Bar camera before it runs dry. If glass breaks, shut the door on his side.',
  tokens: 'Mr. Tokens crawls the vent over the desk. When the coins rattle close, flip the vent seal.',
  twins: 'The music box ran down and woke Lana and Laith. Hold WIND on the Prize Corner camera before it stops.',
  power: 'The power ran out. Close doors only when someone is there, and put the cameras down when you can.',
};
