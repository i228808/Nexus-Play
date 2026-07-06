import { useEffect, useRef } from 'react';

export type GamepadAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'confirm'   // Cross / A
  | 'back'      // Circle / B
  | 'options'   // Triangle / Y
  | 'menu'      // Square / X
  | 'l1'
  | 'r1'
  | 'l2'
  | 'r2'
  | 'start'
  | 'select'
  | 'home';

interface GamepadHandlers {
  onAction: (action: GamepadAction) => void;
  enabled?: boolean;
}

const BUTTON_MAP: Record<number, GamepadAction> = {
  0: 'confirm',
  1: 'back',
  2: 'menu',
  3: 'options',
  4: 'l1',
  5: 'r1',
  6: 'l2',
  7: 'r2',
  8: 'select',
  9: 'start',
  12: 'up',
  13: 'down',
  14: 'left',
  15: 'right',
  16: 'home',
};

// L1/R1 and Home buttons should NOT repeat — single fire only
const NO_REPEAT_ACTIONS = new Set<GamepadAction>(['l1', 'r1', 'l2', 'r2', 'confirm', 'back', 'options', 'menu', 'start', 'select', 'home']);

const DEADZONE = 0.40;
const INITIAL_REPEAT_DELAY = 320;
const REPEAT_INTERVAL = 100;

export function useGamepad({ onAction, enabled = true }: GamepadHandlers) {
  // Store everything in refs so poll closure never goes stale
  const onActionRef = useRef(onAction);
  const enabledRef  = useRef(enabled);
  onActionRef.current = onAction;
  enabledRef.current  = enabled;

  const animFrameRef   = useRef<number | null>(null);
  const pressedRef     = useRef<Set<string>>(new Set());
  const repeatTimers   = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const fire = (action: GamepadAction) => {
      if (!enabledRef.current) return;
      onActionRef.current(action);
    };

    const clearRepeat = (key: string) => {
      const t = repeatTimers.current.get(key);
      if (t !== undefined) { clearTimeout(t); repeatTimers.current.delete(key); }
    };

    const scheduleRepeat = (key: string, action: GamepadAction, first: boolean) => {
      if (NO_REPEAT_ACTIONS.has(action)) return; // shoulder buttons: one-shot only
      const delay = first ? INITIAL_REPEAT_DELAY : REPEAT_INTERVAL;
      const t = setTimeout(() => {
        if (pressedRef.current.has(key)) {
          fire(action);
          scheduleRepeat(key, action, false);
        }
      }, delay);
      repeatTimers.current.set(key, t);
    };

    const lastActionTimes = new Map<string, number>();

    const poll = () => {
      if (!enabledRef.current) {
        animFrameRef.current = requestAnimationFrame(poll);
        return;
      }

      const gamepads = navigator.getGamepads();
      for (const gp of gamepads) {
        if (!gp) continue;

        // ── Buttons ──────────────────────────────────────────
        gp.buttons.forEach((btn, idx) => {
          const action = BUTTON_MAP[idx];
          if (!action) return;
          const key = `btn-${idx}`;
          const pressed = btn.pressed || btn.value > 0.5;

          if (pressed && !pressedRef.current.has(key)) {
            const now = Date.now();
            const last = lastActionTimes.get(key) || 0;
            if (now - last < 200) return; // Prevent button bounce
            
            lastActionTimes.set(key, now);
            pressedRef.current.add(key);
            fire(action);
            scheduleRepeat(key, action, true);
          } else if (!pressed && pressedRef.current.has(key)) {
            pressedRef.current.delete(key);
            clearRepeat(key);
          }
        });

        // ── Left analog stick ─────────────────────────────────
        const lx = gp.axes[0] ?? 0;
        const ly = gp.axes[1] ?? 0;

        const stickChecks: [string, GamepadAction, number, number][] = [
          ['lx-', 'left',  lx, -1],
          ['lx+', 'right', lx,  1],
          ['ly-', 'up',    ly, -1],
          ['ly+', 'down',  ly,  1],
        ];

        for (const [key, action, value, sign] of stickChecks) {
          const active = value * sign > DEADZONE;
          if (active && !pressedRef.current.has(key)) {
            const now = Date.now();
            const last = lastActionTimes.get(key) || 0;
            if (now - last < 200) continue; // Prevent stick bounce/jitter
            
            lastActionTimes.set(key, now);
            pressedRef.current.add(key);
            fire(action);
            scheduleRepeat(key, action, true);
          } else if (!active && pressedRef.current.has(key)) {
            pressedRef.current.delete(key);
            clearRepeat(key);
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(poll);
    };

    animFrameRef.current = requestAnimationFrame(poll);

    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
      repeatTimers.current.forEach(t => clearTimeout(t));
      repeatTimers.current.clear();
      pressedRef.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — everything is accessed via refs
}
