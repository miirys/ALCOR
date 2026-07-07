import React, { useCallback, useState } from 'react';
import { useApp, useInput } from 'ink';
import { ThemeCtx } from './ui.tsx';
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

  const go = useCallback(
    (next: Screen) => {
      setPrev(screen);
      setScreen(next);
    },
    [screen],
  );

  // splash: any key skips
  useInput(
    () => {
      if (screen === 'splash') setScreen('menu');
    },
    { isActive: screen === 'splash' },
  );

  const cycleTheme = useCallback(
    () => setThemeIx((i) => (i + 1) % themes.length),
    [],
  );

  return (
    <ThemeCtx.Provider value={themes[themeIx]!}>
      {screen === 'splash' && <Splash onDone={() => setScreen('menu')} />}
      {screen === 'menu' && (
        <Menu
          onOpen={(s) => {
            setActive(s);
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
    </ThemeCtx.Provider>
  );
}
