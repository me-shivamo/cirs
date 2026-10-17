// CIRS video kiosk settings. Edit titles, texts and timings here.
// Loaded by the page and by the service worker, so it assigns to `self`.
self.KIOSK_CONFIG = {
  // Header text from design 4a.
  eyebrow: 'CCMTEC',
  headline: 'Touch a topic to watch',
  tagline: 'Keep Smiling',

  // Where the hosted site downloads/streams videos from: a folder URL containing hd/ and
  // lite/ (e.g. an R2 bucket), ending in "/". Leave empty to use ./videos/ next to the page.
  remoteBase: '',

  // true = only the 720p Lite copies exist on this host (e.g. the GitHub Pages preview).
  liteOnly: true,

  // Hidden staff screen: hold "Keep Smiling" (top right) for 5 seconds, then enter this PIN.
  staffPin: '2026',

  attractAfterSec: 90,    // idle time on home before the muted showreel starts (0 = never)
  attractClipSec: 15,     // seconds of each topic shown in the showreel
  pauseTimeoutSec: 45,    // a paused video returns home after this long
  stallTimeoutSec: 8,     // a video stuck loading returns home after this long
  idleReloadHours: 4,     // refresh the page (when nobody is using it) after this many hours

  // Shown in this order (rows of 7, 6, 6). `n` is the video's number in the Drive folder.
  topics: [
    { n: '19', slug: 'cirs', title: 'CIRS' },
    { n: '01', slug: 'journey-of-cvs', title: 'Journey of CVs' },
    { n: '02', slug: 'resources', title: 'Resources' },
    { n: '03', slug: 'ed-cell-and-govt', title: 'Ed Cell and Govt' },
    { n: '04', slug: 'children-programs', title: 'Children Programs' },
    { n: '05', slug: 'training-for-staff', title: 'Training for Staff' },
    { n: '06', slug: 'scholarship-and-csr', title: 'Scholarship and CSR' },
    { n: '07', slug: 'chinmaya-seva-camps', title: 'Chinmaya Seva Camps' },
    { n: '08', slug: 'chinmaya-awards', title: 'Chinmaya Awards' },
    { n: '09', slug: 'alumni-achievements', title: 'Alumni Achievements' },
    { n: '10', slug: 'festivals', title: 'Festivals' },
    { n: '11', slug: 'chinmaya-vision-program', title: 'Chinmaya Vision Program' },
    { n: '12', slug: 'video-on-ed-cell', title: 'Video on Ed Cell' },
    { n: '13', slug: 'journey-of-cacs', title: 'Journey of CACS' },
    { n: '14', slug: 'cacs-infrastructure', title: 'CACS Infrastructure' },
    { n: '15', slug: 'advisory-council-cacs', title: 'Advisory Council CACS' },
    { n: '16', slug: 'about-cam', title: 'About Chinmaya Academy of Management' },
    { n: '17', slug: 'cam-modules', title: 'CAM Modules' },
    { n: '18', slug: 'cam-sessions', title: 'CAM Sessions' },
  ],
};
