import { Reducer, useCallback, useEffect, useReducer, useRef } from "react";
import { RipplesState, RippleState, RippleEvent } from "./types.d";
import { isRippleable, isBubbled, createRippleState, getType } from "./utils";

export const CREATE = "CREATE";
export const CANCEL = "CANCEL";
export const RELEASE = "RELEASE";
export const ENTERED = "ENTERED";
export const REMOVE = "REMOVE";

export interface CreateAction<E extends HTMLElement> {
  type: typeof CREATE;
  event: RippleEvent<E>;
  disableSpacebarClick: boolean;
}
export interface ReleaseAction<E extends HTMLElement> {
  type: typeof RELEASE;
  event: RippleEvent<E>;
}
export interface EnteredAction {
  type: typeof ENTERED;
  ripple: RippleState;
}
export interface RemoveAction {
  type: typeof REMOVE;
  ripple: RippleState;
}

export interface CancelAction {
  type: typeof CANCEL;
  ease: boolean;
}
type RippleStateAction<E extends HTMLElement> =
  | CreateAction<E>
  | ReleaseAction<E>
  | CancelAction
  | EnteredAction
  | RemoveAction;
type RippleStateReducer<E extends HTMLElement> = Reducer<
  RipplesState,
  RippleStateAction<E>
>;

/**
 * This function will create a simplified version of the create event
 * that only includes the parts that are needed to trigger a ripple.
 * This is really only required since `event.persist()` crashed a lot
 * when spamming the trigger events and it threw warnings when not
 * persisting the event.
 */
export function createRippleAction<E extends HTMLElement>(
  event: RippleEvent<E>,
  disableSpacebarClick: boolean
): CreateAction<E> {
  const {
    type,
    target,
    currentTarget,
    touches,
    pageX,
    pageY,
    button,
    key,
  } = event as React.MouseEvent<E> &
    React.TouchEvent<E> &
    React.KeyboardEvent<E>;

  return {
    type: CREATE,
    disableSpacebarClick,
    event: {
      type,
      key,
      target,
      button,
      currentTarget,
      touches,
      pageX,
      pageY,
    },
  };
}

function createRipple(
  state: RipplesState,
  event: RippleEvent<HTMLElement>,
  disableSpacebarClick: boolean
) {
  if (!isRippleable(event, disableSpacebarClick) || isBubbled(event)) {
    return state;
  } else if (
    getType(event) !== "touch" &&
    state.find(({ type }) => type === "touch")
  ) {
    // since mouse events get triggered after a touch, we don't want to create 2 ripples
    return state;
  }

  const ripple = createRippleState(event);
  return [...state, ripple];
}

function enteredRipple(state: RipplesState, ripple: RippleState) {
  const i = state.findIndex(r => r === ripple);
  if (i === -1 || ripple.exiting) {
    return state;
  }

  const nextState = state.slice();
  const exiting = !ripple.holding || Date.now() - ripple.startTime > 300;
  nextState[i] = {
    ...ripple,
    exiting,
    entered: true,
  };
  return nextState;
}

function releaseRipple(state: RipplesState) {
  const i = state.findIndex(r => r.holding && !r.exiting);
  if (i === -1) {
    return state;
  }

  const ripple = state[i];
  const exiting = ripple.entered || Date.now() - ripple.startTime > 300;
  const nextState = state.slice();
  nextState[i] = {
    ...ripple,
    exiting,
    holding: false,
  };
  return nextState;
}

function removeRipple(state: RipplesState, ripple: RippleState) {
  const i = state.findIndex(r => r.startTime === ripple.startTime);
  if (i === -1) {
    return state;
  }

  const nextState = state.slice();
  nextState.splice(i, 1);
  return nextState;
}

function cancelRipples(state: RipplesState, ease: boolean) {
  if (ease) {
    return state.map(r => ({
      ...r,
      exiting: true,
      mounted: true,
      holding: false,
    }));
  }

  return [];
}

export function reducer<E extends HTMLElement>(
  state: RipplesState = [],
  action: RippleStateAction<E>
) {
  switch (action.type) {
    case CREATE:
      return createRipple(state, action.event, action.disableSpacebarClick);
    case RELEASE:
      return releaseRipple(state);
    case CANCEL:
      return cancelRipples(state, action.ease);
    case ENTERED:
      return enteredRipple(state, action.ripple);
    case REMOVE:
      return removeRipple(state, action.ripple);
    default:
      return state;
  }
}

/**
 * This hook creates memoized callbacks for each part of the ripple transition
 * as well as returning the current list of ripples.
 */
export function useRippleTransition<E extends HTMLElement = HTMLElement>(
  disableSpacebarClick: boolean = false
) {
  const [state, dispatch] = useReducer<RippleStateReducer<E>>(reducer, []);
  const spacebarRef = useRef(disableSpacebarClick);
  useEffect(() => {
    spacebarRef.current = disableSpacebarClick;
  });

  const create = useCallback((event: RippleEvent<E>) => {
    const disableSpacebarClick = spacebarRef.current;
    dispatch(createRippleAction(event, disableSpacebarClick));
  }, []);
  const release = useCallback((event: RippleEvent<E>) => {
    dispatch({ type: RELEASE, event });
  }, []);
  const entered = useCallback((ripple: RippleState) => {
    dispatch({ type: ENTERED, ripple });
  }, []);
  const cancel = useCallback((ease: boolean = false) => {
    dispatch({ type: CANCEL, ease });
  }, []);
  const remove = useCallback((ripple: RippleState) => {
    dispatch({ type: REMOVE, ripple });
  }, []);

  return { state, create, release, entered, remove, cancel };
}
