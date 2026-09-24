import { useCallback, useEffect, useRef, useState } from "react";

const LANGUAGES = [
  {
    lang: "en-IN",
    code: "en",
    native: "English",
  },
  {
    lang: "bn-IN",
    code: "bn",
    native: "বাংলা",
  },
  {
    lang: "hi-IN",
    code: "hi",
    native: "हिन्दी",
  },
];

const CONFIG = {
  defaultLang: "en-IN",
  restartDelay: 500,
  maxRestartDelay: 2500,
  maxRestartsInARow: 30,
  keepAlive: true,
};

function detectDevice() {
  const ua = navigator.userAgent;
  const uaLC = ua.toLowerCase();
  const platform = navigator.platform || "";
  const maxTouch = navigator.maxTouchPoints || 0;

  const isInApp =
    /fban|fbav|fb_iab|instagram|whatsapp|line\/|twitter|micromessenger|gsa\/|snapchat/i.test(
      ua
    ) ||
    (/(iphone|ipad|ipod)/i.test(ua) &&
      !/safari/i.test(ua) &&
      !/crios|fxios/i.test(ua));

  const isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    (/macintosh/i.test(ua) && maxTouch > 1);

  const isAndroid = /android/i.test(ua);

  const isChromeIOS = /crios/i.test(ua);
  const isFirefoxIOS = /fxios/i.test(ua);
  const isEdgeIOS = /edgios/i.test(ua);

  const isSafariDesktop =
    /safari/i.test(ua) &&
    !/chrome|chromium|edg|crios|fxios/i.test(ua);

  const isChromeDesktop =
    /chrome/i.test(ua) && !/edg|crios|opr/i.test(ua);

  const isEdgeDesktop =
    /edg/i.test(ua) && !/edgios|edge\//i.test(ua);

  const isFirefox =
    /firefox|fxios/i.test(ua) && !/fxios/i.test(ua);

  const isSafariIOS =
    isIOS && !isChromeIOS && !isFirefoxIOS && !isEdgeIOS;

  const hasSpeechAPI = !!(
    window.SpeechRecognition ||
    window.webkitSpeechRecognition
  );

  const isSecure = window.isSecureContext;

  let type = "unknown";
  let label = "Unknown";
  let warn = false;

  if (!isSecure) {
    type = "insecure";
    label = "insecure";
    warn = true;
  } else if (isInApp) {
    type = "inapp";
    label = "in-app browser";
    warn = true;
  } else if (isFirefox && !isFirefoxIOS) {
    type = "firefox";
    label = "Firefox";
    warn = true;
  } else if (isSafariIOS) {
    type = "ios-safari";
    label = "iOS Safari";
  } else if (isChromeIOS) {
    type = "chrome-ios";
    label = "Chrome iOS";
    warn = true;
  } else if (isFirefoxIOS) {
    type = "firefox-ios";
    label = "Firefox iOS";
    warn = true;
  } else if (isEdgeIOS) {
    type = "edge-ios";
    label = "Edge iOS";
    warn = true;
  } else if (isAndroid && (isChromeDesktop || /chrome/i.test(ua))) {
    type = "android-chrome";
    label = "Android Chrome";
  } else if (isChromeDesktop) {
    type = "desktop-chrome";
    label = "Desktop Chrome";
  } else if (isEdgeDesktop) {
    type = "desktop-edge";
    label = "Desktop Edge";
  } else if (isSafariDesktop) {
    type = "desktop-safari";
    label = "Desktop Safari";
  } else if (isIOS) {
    type = "ios-other";
    label = "iOS browser";
    warn = true;
  } else {
    type = "other";
    label = "Other";
  }

  return {
    type,
    label,
    warn,
    isIOS,
    isAndroid,
    hasSpeechAPI,
    isSecure,
    isInApp,
    ua,
    platform,
    uaLC,
  };
}

function getTuning(type) {
  switch (type) {
    case "ios-safari":
      return {
        restartDelay: 500,
        maxRestartDelay: 2000,
        expectLongSessions: true,
        sessionHint:
          "Safari keeps one session alive for a long time. Speak naturally.",
      };

    case "desktop-chrome":
    case "desktop-edge":
      return {
        restartDelay: 300,
        maxRestartDelay: 1500,
        expectLongSessions: true,
        sessionHint:
          "True single session — speak as long as you like, pause freely.",
      };

    case "desktop-safari":
      return {
        restartDelay: 300,
        maxRestartDelay: 1500,
        expectLongSessions: true,
        sessionHint:
          "Desktop Safari supports long sessions. Speak freely.",
      };

    case "android-chrome":
      return {
        restartDelay: 500,
        maxRestartDelay: 2500,
        expectLongSessions: false,
        sessionHint:
          "Avoid pauses longer than 3-4s. Text is safe across restarts.",
      };

    case "chrome-ios":
    case "ios-other":
    case "edge-ios":
      return {
        restartDelay: 500,
        maxRestartDelay: 2000,
        expectLongSessions: true,
        sessionHint:
          "iOS engine. Long sessions work. Speak naturally.",
      };

    case "firefox":
    case "firefox-ios":
      return {
        restartDelay: 800,
        maxRestartDelay: 3000,
        expectLongSessions: false,
        sessionHint:
          "Firefox has limited Web Speech support.",
      };

    default:
      return {
        restartDelay: 500,
        maxRestartDelay: 2500,
        expectLongSessions: false,
        sessionHint:
          "If repeats appear, avoid pausing for long.",
      };
  }
}

function normalizeWords(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean);
}

function overlapWords(a, b) {
  const A = normalizeWords(a);
  const B = normalizeWords(b);

  if (!A.length || !B.length) return 0;

  const max = Math.min(A.length, B.length, 40);

  for (let len = max; len > 0; len--) {
    let match = true;

    for (let i = 0; i < len; i++) {
      if (A[A.length - len + i] !== B[i]) {
        match = false;
        break;
      }
    }

    if (match) return len;
  }

  return 0;
}

function smartAppend(A, B) {
  if (!B || !B.trim()) return A || "";
  if (!A || !A.trim()) return B.trim();

  const overlap = overlapWords(A, B);

  const Bwords = B.trim()
    .split(/\s+/)
    .filter(Boolean);

  if (overlap === 0) {
    return `${A.trim()} ${B.trim()}`
      .replace(/\s+/g, " ")
      .trim();
  }

  const newWords = Bwords.slice(overlap).join(" ");

  if (!newWords) return A.trim();

  return `${A.trim()} ${newWords}`
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(text) {
  return text.trim()
    ? text.trim().split(/\s+/).length
    : 0;
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;

  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function App() {
  const [device, setDevice] = useState(null);
  const [tuning, setTuning] = useState(null);

  const [currentLang, setCurrentLang] = useState(
    CONFIG.defaultLang
  );

  const [currentCode, setCurrentCode] = useState("en");

  const [segments, setSegments] = useState([]);

  const [sessionFinalText, setSessionFinalText] =
    useState("");

  const [currentInterim, setCurrentInterim] =
    useState("");

  const [listening, setListening] = useState(false);

  const [savedText, setSavedText] = useState("");

  const [savedMeta, setSavedMeta] = useState("");

  const [statusText, setStatusText] =
    useState("idle");

  const [logs, setLogs] = useState([]);

  const [sessionCount, setSessionCount] =
    useState(0);

  const [restartCount, setRestartCount] =
    useState(0);

  const [totalSeconds, setTotalSeconds] =
    useState(0);

  const [advisory, setAdvisory] = useState(null);

  const recognitionRef = useRef(null);

  const intentionalStopRef = useRef(false);

  const restartingRef = useRef(false);

  const consecutiveRestartsRef = useRef(0);

  const currentDelayRef = useRef(
    CONFIG.restartDelay
  );

  const recentWordsRef = useRef([]);

  const timerRef = useRef(null);

  const sessionStartRef = useRef(null);

  const wakeLockRef = useRef(null);

  const silentAudioRef = useRef(null);

  const sessionFinalTextRef =
    useRef("");

  const currentInterimRef =
    useRef("");

  const segmentsRef = useRef([]);

  const currentLangRef =
    useRef(CONFIG.defaultLang);

  const currentCodeRef =
    useRef("en");

  const listeningRef =
    useRef(false);

  const sessionCountRef =
    useRef(0);

  const log = useCallback((message, type = "") => {
    const time = new Date()
      .toTimeString()
      .slice(0, 8);

    setLogs((prev) => [
      ...prev,
      {
        time,
        message,
        type,
      },
    ]);
  }, []);

  useEffect(() => {
    const detected = detectDevice();

    setDevice(detected);

    const deviceTuning =
      getTuning(detected.type);

    setTuning(deviceTuning);

    CONFIG.restartDelay =
      deviceTuning.restartDelay;

    CONFIG.maxRestartDelay =
      deviceTuning.maxRestartDelay;

    currentDelayRef.current =
      CONFIG.restartDelay;

    log(
      `Device: ${detected.label} (${detected.type})`,
      "info"
    );

    log(
      `Speech API: ${
        detected.hasSpeechAPI
          ? "available"
          : "NOT available"
      }`,
      detected.hasSpeechAPI ? "" : "err"
    );

    log(
      `Secure: ${detected.isSecure}`,
      detected.isSecure ? "" : "err"
    );

    log(
      `Tuning: restartDelay=${CONFIG.restartDelay}ms`,
      "info"
    );

    if (!detected.isSecure) {
      setAdvisory({
        type: "err",
        title: "⚠️ Not a secure connection",
        text: (
          <>
            Speech recognition requires HTTPS.
            Open this page via{" "}
            <code>https://</code> or{" "}
            <code>localhost</code>.
          </>
        ),
      });
    } else if (detected.isInApp) {
      setAdvisory({
        type: "err",
        title: "⚠️ In-app browser detected",
        text: (
          <>
            You opened this from Instagram,
            Facebook, WhatsApp, or similar.
            Speech recognition may not work there.
            Open this page in Chrome or Safari.
          </>
        ),
      });
    } else if (detected.type === "firefox") {
      setAdvisory({
        type: "err",
        title:
          "⚠️ Firefox has limited Web Speech support",
        text:
          "Please use Chrome, Edge, or Safari for speech recognition.",
      });
    } else if (detected.type === "chrome-ios") {
      setAdvisory({
        type: "info",
        title: "ℹ️ Chrome on iOS",
        text:
          "iOS Chrome uses Safari's engine. For best results, use Safari.",
      });
    } else if (detected.isAndroid) {
      setAdvisory({
        type: "info",
        title: "ℹ️ Android Chrome tip",
        text:
          "Keep speaking without long pauses. Browser restarts are handled automatically.",
      });
    }
  }, [log]);

  const rememberWords = useCallback(
    (text, langCode) => {
      const words = normalizeWords(text);

      recentWordsRef.current.push(
        ...words.map((w) => ({
          w,
          lang: langCode,
        }))
      );

      if (
        recentWordsRef.current.length >
        80
      ) {
        recentWordsRef.current =
          recentWordsRef.current.slice(-80);
      }
    },
    []
  );

  const resetMemory = useCallback(() => {
    recentWordsRef.current = [];
  }, []);

  const skipRecentReplay = useCallback(
    (text) => {
      const incoming =
        normalizeWords(text);

      const recent =
        recentWordsRef.current.map(
          (r) => r.w
        );

      if (!incoming.length) return 0;

      const max = Math.min(
        incoming.length,
        recent.length,
        40
      );

      for (let k = max; k >= 2; k--) {
        let match = true;

        for (let i = 0; i < k; i++) {
          if (
            incoming[i] !==
            recent[
              recent.length - k + i
            ]
          ) {
            match = false;
            break;
          }
        }

        if (match) return k;
      }

      return 0;
    },
    []
  );

  const isFullReplay = useCallback(
    (text) => {
      const incoming =
        normalizeWords(text);

      if (incoming.length < 2) return false;

      const recent =
        recentWordsRef.current.map(
          (r) => r.w
        );

      const n = incoming.length;
      const m = recent.length;

      if (n > m) return false;

      for (
        let start = 0;
        start <= m - n;
        start++
      ) {
        let ok = true;

        for (let i = 0; i < n; i++) {
          if (
            recent[start + i] !==
            incoming[i]
          ) {
            ok = false;
            break;
          }
        }

        if (ok) return true;
      }

      return false;
    },
    []
  );

  const isMostlyReplay = useCallback(
    (text) => {
      const incoming =
        normalizeWords(text);

      if (incoming.length < 2) return false;

      const recentSet = new Set(
        recentWordsRef.current.map(
          (r) => r.w
        )
      );

      let hits = 0;

      for (const word of incoming) {
        if (recentSet.has(word)) {
          hits++;
        }
      }

      return (
        hits / incoming.length >= 0.7
      );
    },
    []
  );

  const plainText = useCallback(() => {
    let output = "";

    for (const segment of segmentsRef.current) {
      output += segment.text + " ";
    }

    if (
      sessionFinalTextRef.current.trim()
    ) {
      output +=
        sessionFinalTextRef.current.trim() +
        " ";
    }

    if (
      currentInterimRef.current.trim()
    ) {
      output +=
        currentInterimRef.current.trim();
    }

    return output
      .replace(/\s+/g, " ")
      .trim();
  }, []);

  const renderText = useCallback(() => {
    const finalText =
      sessionFinalTextRef.current;

    const interim =
      currentInterimRef.current;

    return {
      finalText,
      interim,
    };
  }, []);

  const commitSession = useCallback(() => {
    const text =
      sessionFinalTextRef.current.trim();

    if (text) {
      const oldSegments =
        [...segmentsRef.current];

      const last =
        oldSegments[
          oldSegments.length - 1
        ];

      if (
        last &&
        last.lang === currentCodeRef.current
      ) {
        oldSegments[
          oldSegments.length - 1
        ] = {
          ...last,
          text: smartAppend(
            last.text,
            text
          ),
        };
      } else {
        oldSegments.push({
          lang: currentCodeRef.current,
          langFull:
            currentLangRef.current,
          text,
        });
      }

      segmentsRef.current =
        oldSegments;

      setSegments(oldSegments);

      rememberWords(
        text,
        currentCodeRef.current
      );
    }

    sessionFinalTextRef.current =
      "";

    currentInterimRef.current =
      "";

    setSessionFinalText("");

    setCurrentInterim("");
  }, [rememberWords]);

  const enableKeepAwake =
    useCallback(async () => {
      try {
        if ("wakeLock" in navigator) {
          const wakeLock =
            await navigator.wakeLock.request(
              "screen"
            );

          wakeLockRef.current =
            wakeLock;

          log("🔆 wake lock on");

          wakeLock.addEventListener(
            "release",
            () => {
              log(
                "wake lock off",
                "warn"
              );
            }
          );

          return;
        }
      } catch (e) {}

      if (
        CONFIG.keepAlive &&
        !silentAudioRef.current
      ) {
        try {
          const wav =
            "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

          const audio = new Audio(wav);

          audio.loop = true;
          audio.volume = 0.001;

          await audio.play();

          silentAudioRef.current =
            audio;

          log(
            "🔇 silent audio keep-alive"
          );
        } catch (e) {}
      }
    }, [log]);

  const disableKeepAwake =
    useCallback(() => {
      if (wakeLockRef.current) {
        try {
          wakeLockRef.current.release();
        } catch (e) {}

        wakeLockRef.current = null;
      }

      if (silentAudioRef.current) {
        try {
          silentAudioRef.current.pause();
        } catch (e) {}

        silentAudioRef.current = null;
      }
    }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) return;

    sessionStartRef.current =
      Date.now();

    timerRef.current =
      setInterval(() => {
        if (sessionStartRef.current) {
          const elapsed =
            Math.floor(
              (Date.now() -
                sessionStartRef.current) /
                1000
            );

          setTotalSeconds(
            (previous) => previous + 1
          );
        }
      }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (sessionStartRef.current) {
      const elapsed =
        Math.floor(
          (Date.now() -
            sessionStartRef.current) /
            1000
        );

      setTotalSeconds(
        (previous) =>
          previous + elapsed
      );

      sessionStartRef.current =
        null;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const buildRecognizer =
    useCallback(() => {
      const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

      if (!SpeechRecognition) {
        return null;
      }

      const recognition =
        new SpeechRecognition();

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang =
        currentLangRef.current;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        restartingRef.current =
          false;

        consecutiveRestartsRef.current =
          0;

        currentDelayRef.current =
          CONFIG.restartDelay;

        sessionCountRef.current += 1;

        setSessionCount(
          sessionCountRef.current
        );

        log(
          `✅ SESSION #${sessionCountRef.current} (lang=${currentLangRef.current})`,
          "info"
        );

        if (
          listeningRef.current
        ) {
          setStatusText(
            `listening · ${currentCodeRef.current}`
          );
        }

        if (!timerRef.current) {
          startTimer();
        }
      };

      recognition.onspeechstart = () => {
        log("🗣 speech");
      };

      recognition.onspeechend = () => {
        log("🤐 silence");
      };

      recognition.onresult = (event) => {
        let newSessionFinal = "";
        let newInterim = "";

        for (
          let i = 0;
          i < event.results.length;
          i++
        ) {
          const result =
            event.results[i];

          const text =
            result[0].transcript;

          if (result.isFinal) {
            newSessionFinal += text;
          } else {
            newInterim += text;
          }
        }

        currentInterimRef.current =
          newInterim.trim();

        setCurrentInterim(
          newInterim.trim()
        );

        if (
          newSessionFinal.trim()
        ) {
          const cleaned =
            newSessionFinal.trim();

          if (
            isFullReplay(cleaned)
          ) {
            log(
              "⏭ skip full replay",
              "warn"
            );

            return;
          }

          if (
            isMostlyReplay(cleaned)
          ) {
            log(
              "⏭ skip mostly-replay",
              "warn"
            );

            return;
          }

          const skip =
            skipRecentReplay(cleaned);

          const words =
            cleaned
              .split(/\s+/)
              .filter(Boolean);

          const trimmedNew =
            words
              .slice(skip)
              .join(" ");

          if (trimmedNew) {
            const before =
              sessionFinalTextRef.current;

            const updated =
              smartAppend(
                sessionFinalTextRef.current,
                trimmedNew
              );

            sessionFinalTextRef.current =
              updated;

            setSessionFinalText(
              updated
            );

            const added =
              updated
                .slice(before.length)
                .trim();

            if (added) {
              rememberWords(
                added,
                currentCodeRef.current
              );
            }
          }
        }
      };

      recognition.onerror = (event) => {
        log(
          `❌ error: ${event.error}`,
          "err"
        );

        switch (event.error) {
          case "not-allowed":
          case "service-not-allowed":
            intentionalStopRef.current =
              true;

            listeningRef.current =
              false;

            setListening(false);

            setStatusText(
              "mic blocked"
            );

            setAdvisory({
              type: "err",
              title:
                "⚠️ Microphone blocked",
              text:
                "Allow microphone permission in your browser and reload the page.",
            });

            break;

          case "audio-capture":
            log(
              "→ no mic",
              "err"
            );
            break;

          case "network":
            log(
              "→ network error",
              "warn"
            );
            break;

          default:
            break;
        }
      };

      recognition.onend = () => {
        log(
          `🔚 SESSION #${sessionCountRef.current} ended`,
          "info"
        );

        if (
          listeningRef.current &&
          !intentionalStopRef.current
        ) {
          commitSession();

          consecutiveRestartsRef.current +=
            1;

          setRestartCount(
            (previous) =>
              previous + 1
          );

          if (
            consecutiveRestartsRef.current >
            CONFIG.maxRestartsInARow
          ) {
            log(
              "⛔ too many restarts — pausing 5s",
              "warn"
            );

            consecutiveRestartsRef.current =
              0;

            setTimeout(() => {
              if (
                listeningRef.current &&
                !intentionalStopRef.current
              ) {
                safeStart();
              }
            }, 5000);

            return;
          }

          const delay =
            currentDelayRef.current;

          log(
            `↻ forced restart (${delay}ms)`,
            "warn"
          );

          setTimeout(() => {
            if (
              listeningRef.current &&
              !intentionalStopRef.current
            ) {
              safeStart();
            }
          }, delay);

          currentDelayRef.current =
            Math.min(
              currentDelayRef.current *
                1.4,
              CONFIG.maxRestartDelay
            );
        } else {
          commitSession();

          stopTimer();

          setListening(false);

          setStatusText("idle");
        }
      };

      return recognition;
    }, [
      commitSession,
      isFullReplay,
      isMostlyReplay,
      skipRecentReplay,
      rememberWords,
      log,
      startTimer,
      stopTimer,
    ]);

  const safeStart = useCallback(() => {
    if (
      !recognitionRef.current ||
      restartingRef.current
    ) {
      return;
    }

    restartingRef.current = true;

    try {
      recognitionRef.current.start();
    } catch (error) {
      restartingRef.current = false;

      if (
        error.name ===
        "InvalidStateError"
      ) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}

        setTimeout(() => {
          if (
            listeningRef.current &&
            !intentionalStopRef.current
          ) {
            safeStart();
          }
        }, 400);
      } else {
        setTimeout(() => {
          if (
            listeningRef.current &&
            !intentionalStopRef.current
          ) {
            safeStart();
          }
        }, 800);
      }
    }
  }, []);

  const startRecognition =
    useCallback(async () => {
      const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

      if (!SpeechRecognition) {
        log(
          "Speech API not supported",
          "err"
        );

        setAdvisory({
          type: "err",
          title:
            "⚠️ Speech recognition not supported",
          text:
            "Use Google Chrome, Microsoft Edge, or Safari.",
        });

        return;
      }

      log("--- Start ---", "info");

      intentionalStopRef.current =
        false;

      listeningRef.current = true;

      setListening(true);

      restartingRef.current =
        false;

      consecutiveRestartsRef.current =
        0;

      currentDelayRef.current =
        CONFIG.restartDelay;

      sessionCountRef.current = 0;

      setSessionCount(0);

      setRestartCount(0);

      if (
        !recognitionRef.current
      ) {
        recognitionRef.current =
          buildRecognizer();
      }

      try {
        const stream =
          await navigator.mediaDevices.getUserMedia(
            {
              audio: true,
            }
          );

        log(
          "✅ mic permission granted"
        );

        stream
          .getTracks()
          .forEach((track) =>
            track.stop()
          );
      } catch (error) {
        log(
          `❌ getUserMedia: ${error.name}`,
          "err"
        );

        listeningRef.current =
          false;

        setListening(false);

        setStatusText(
          "microphone blocked"
        );

        return;
      }

      await enableKeepAwake();

      setStatusText(
        `listening · ${currentCodeRef.current}`
      );

      if (!timerRef.current) {
        startTimer();
      }

      setTimeout(() => {
        if (!listeningRef.current) {
          return;
        }

        safeStart();
      }, 150);
    }, [
      buildRecognizer,
      enableKeepAwake,
      log,
      safeStart,
      startTimer,
    ]);

  const stopRecognition =
    useCallback(() => {
      log("⏹ Stop", "info");

      intentionalStopRef.current =
        true;

      listeningRef.current =
        false;

      setListening(false);

      if (
        recognitionRef.current
      ) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }

      commitSession();

      stopTimer();

      disableKeepAwake();

      setStatusText("idle");
    }, [
      commitSession,
      disableKeepAwake,
      log,
      stopTimer,
    ]);

  const changeLanguage = useCallback(
    (language) => {
      if (
        currentLangRef.current ===
          language.lang &&
        currentCodeRef.current ===
          language.code
      ) {
        return;
      }

      log(
        `🌐 language → ${language.lang}`,
        "info"
      );

      if (listeningRef.current) {
        commitSession();

        currentLangRef.current =
          language.lang;

        currentCodeRef.current =
          language.code;

        setCurrentLang(
          language.lang
        );

        setCurrentCode(
          language.code
        );

        if (
          recognitionRef.current
        ) {
          try {
            recognitionRef.current.stop();
          } catch (e) {}
        }

        recognitionRef.current =
          buildRecognizer();

        setTimeout(() => {
          if (
            listeningRef.current &&
            !intentionalStopRef.current
          ) {
            safeStart();
          }
        }, 300);
      } else {
        currentLangRef.current =
          language.lang;

        currentCodeRef.current =
          language.code;

        setCurrentLang(
          language.lang
        );

        setCurrentCode(
          language.code
        );
      }
    },
    [
      buildRecognizer,
      commitSession,
      log,
      safeStart,
    ]
  );

  const submitText = () => {
    const text = plainText();

    if (!text) {
      setSavedText(
        "⚠️ Nothing to submit."
      );

      setSavedMeta("");

      return;
    }

    setSavedText(text);

    setSavedMeta(
      `${wordCount(text)} words · ${text.length} chars`
    );

    log(
      `📥 Submitted (${wordCount(
        text
      )} words)`,
      "info"
    );
  };

  const copyText = async () => {
    const text = plainText();

    if (!text) return;

    try {
      await navigator.clipboard.writeText(
        text
      );

      log("📋 Copied", "info");
    } catch (error) {
      log(
        `❌ Clipboard: ${error.message}`,
        "err"
      );
    }
  };

  const clearAll = () => {
    intentionalStopRef.current =
      true;

    listeningRef.current =
      false;

    setListening(false);

    if (
      recognitionRef.current
    ) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }

    segmentsRef.current = [];

    sessionFinalTextRef.current =
      "";

    currentInterimRef.current =
      "";

    setSegments([]);

    setSessionFinalText("");

    setCurrentInterim("");

    setRestartCount(0);

    sessionCountRef.current = 0;

    setSessionCount(0);

    resetMemory();

    stopTimer();

    setTotalSeconds(0);

    setSavedText(
      "Submitted text appears here."
    );

    setSavedMeta("");

    disableKeepAwake();

    setStatusText("idle");

    log("🧹 Cleared", "info");
  };

  useEffect(() => {
    return () => {
      intentionalStopRef.current =
        true;

      if (
        recognitionRef.current
      ) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }

      if (timerRef.current) {
        clearInterval(
          timerRef.current
        );
      }

      disableKeepAwake();
    };
  }, [disableKeepAwake]);

  const finalPlainText =
    segments
      .map((segment) => segment.text)
      .join(" ");

  const completeText = [
    finalPlainText,
    sessionFinalText,
    currentInterim,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const displaySegments = [
    ...segments,
    ...(sessionFinalText
      ? [
          {
            lang: currentCode,
            text: sessionFinalText,
            temporary: true,
          },
        ]
      : []),
  ];

  const displayWordCount =
    wordCount(completeText);

  const elapsedTime =
    totalSeconds +
    (sessionStartRef.current
      ? Math.floor(
          (Date.now() -
            sessionStartRef.current) /
            1000
        )
      : 0);

  return (
    <div className="app">
      <header className="header">
        <h1>
          🎤 Speech to Text

          <span className="pill">
            ADAPTIVE
          </span>

          {device && (
            <span
              className={`device ${
                device.warn ? "warn" : ""
              }`}
            >
              {device.label}
            </span>
          )}
        </h1>

        <div className="sub">
          {tuning?.sessionHint ||
            "Detecting your device…"}
        </div>
      </header>

      {advisory && (
        <div
          className={`advisory ${advisory.type}`}
        >
          <strong>
            {advisory.title}
          </strong>

          <div>{advisory.text}</div>
        </div>
      )}

      <div className="lang-bar">
        {LANGUAGES.map((language) => (
          <button
            key={language.lang}
            className={`lang-btn ${
              currentLang ===
              language.lang
                ? "active"
                : ""
            }`}
            onClick={() =>
              changeLanguage(language)
            }
          >
            <span className="native">
              {language.native}
            </span>

            <span className="code">
              {language.lang}
            </span>
          </button>
        ))}
      </div>

      <div className="box">
        <h3>
          <span>
            🔴 Live transcript
          </span>

          <span className="meta">
            {displayWordCount} words ·{" "}
            {formatTime(elapsedTime)}
          </span>
        </h3>

        <div
          className={`transcript ${
            !completeText
              ? "placeholder"
              : ""
          } ${
            currentInterim
              ? "interim"
              : ""
          }`}
        >
          {!completeText ? (
            'Tap "Start" and speak…'
          ) : (
            <>
              {displaySegments.map(
                (segment, index) => (
                  <span
                    key={`${index}-${segment.lang}`}
                  >
                    <span
                      className={`lang-tag ${segment.lang}`}
                    >
                      {segment.lang}
                    </span>

                    {segment.text}{" "}
                  </span>
                )
              )}

              {currentInterim && (
                <>
                  <span
                    className={`lang-tag ${currentCode}`}
                  >
                    {currentCode}
                  </span>

                  <em>
                    {currentInterim}
                  </em>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="box">
        <h3>
          <span>✅ Submitted</span>

          <span className="meta">
            {savedMeta}
          </span>
        </h3>

        <div
          className={`transcript ${
            !savedText
              ? "placeholder"
              : ""
          }`}
        >
          {savedText ||
            "Submitted text appears here."}
        </div>
      </div>

      <div className="btns">
        <button
          onClick={startRecognition}
          disabled={listening}
        >
          ▶ Start
        </button>

        <button
          className="alt"
          onClick={stopRecognition}
          disabled={!listening}
        >
          ⏹ Stop
        </button>
      </div>

      <div className="btns">
        <button
          className="green"
          onClick={submitText}
        >
          📥 Submit
        </button>

        <button
          className="alt"
          onClick={copyText}
        >
          📋 Copy
        </button>

        <button
          className="red"
          onClick={clearAll}
        >
          🧹 Clear
        </button>
      </div>

      <div className="status">
        <span
          className={`dot ${
            listening ? "on" : ""
          }`}
        />

        <span>
          {statusText}
        </span>

        {listening && (
          <span
            className={`session-badge ${
              sessionCount > 1
                ? "restart"
                : ""
            }`}
          >
            {sessionCount}{" "}
            {sessionCount === 1
              ? "session"
              : "sessions"}
          </span>
        )}
      </div>

      <details>
        <summary>
          ▸ Diagnostics
        </summary>

        <div className="log">
          {logs.length === 0
            ? "Booting…"
            : logs.map(
                (entry, index) => (
                  <div
                    key={index}
                    className={
                      entry.type
                    }
                  >
                    [{entry.time}]{" "}
                    {entry.message}
                  </div>
                )
              )}
        </div>
      </details>
    </div>
  );
}