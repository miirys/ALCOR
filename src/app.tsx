import React, { useCallback, useRef, useState } from 'react';
import { useApp, useInput } from 'ink';
import { ThemeCtx, ExitArmCtx } from './ui.tsx';
import { themes } from './theme.ts';
import { Splash } from './screens/Splash.tsx';
import { Menu } from './screens/Menu.tsx';
import { Session } from './screens/Session.tsx';
import { Settings } from './screens/Settings.tsx';
import { DiffReview } from './screens/DiffReview.tsx';
import type { SessionMeta } from './mock/data.ts';

type Screen = 'splash' | 'menu' | 'session' | 'settings' | 'diff';

export function App() {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>('splash');
  const [prev, setPrev] = useState<Screen>('menu');
  const [themeIx, setThemeIx] = useState(0);
  const [active, setActive] = useState<SessionMeta | null>(null);
  const [exitArm, setExitArm] = useState(false);
  const armTimer = useRef<NodeJS.Timeout | null>(null);

  const go = useCallback(
    (next: Screen) => {
      setPrev(screen);
      setScreen(next);
    },
    [screen],
  );

  // Ctrl+C is a two-step exit: the first press arms a short-lived warning
  // (accidental hits are free), the second within the window really quits.
  useInput((ch, key) => {
    if (!(key.ctrl && ch === 'c')) return;
    if (exitArm) {
      if (armTimer.current) clearTimeout(armTimer.current);
      exit();
      return;
    }
    setExitArm(true);
    if (armTimer.current) clearTimeout(armTimer.current);
    armTimer.current = setTimeout(() => setExitArm(false), 2500);
  });

  // splash: any key skips
  useInput(
    () => {
      if (screen === 'splash') setScreen('menu');
    },
    { isActive: screen === 'splash' },
  );

  return (
    <ThemeCtx.Provider value={themes[themeIx]!}>
      <ExitArmCtx.Provider value={exitArm}>
        {screen === 'splash' && <Splash onDone={() => setScreen('menu')} />}
        {screen === 'menu' && (
          <Menu
            onOpen={(s) => {
              setActive(s);
              (globalThis as Record<string, unknown>).__ALCOR_SESSION__ = s?.id ?? `s-${Date.now().toString(36)}`;
              go('session');
            }}
            onSettings={() => go('settings')}
            onQuit={exit}
          />
        )}
        {screen === 'session' && (
          <Session
            meta={active}
            onBack={() => go('menu')}
            onSettings={() => go('settings')}
            onDiff={() => go('diff')}
            themeIx={themeIx}
            onSetTheme={setThemeIx}
          />
        )}
        {screen === 'settings' && (
          <Settings
            themeIx={themeIx}
            onTheme={setThemeIx}
            onBack={() => setScreen(prev === 'settings' ? 'menu' : prev)}
          />
        )}
        {screen === 'diff' && <DiffReview onBack={() => setScreen('session')} />}
      </ExitArmCtx.Provider>
    </ThemeCtx.Provider>
  );
}
