import { of } from "rxjs"
import { createStateNode } from "./internal"
import { StateNode } from "./types"

export type RootNodeKey<CtxValue, KeyName extends string> = KeyName extends ""
  ? {}
  : Record<KeyName, CtxValue>

type TeardownFn = () => void
export interface RootNode<CtxValue, KeyName extends string, KeyValue>
  extends StateNode<CtxValue, RootNodeKey<KeyValue, KeyName>> {
  run: KeyName extends ""
    ? never extends CtxValue
      ? () => TeardownFn
      : (key: unknown, ctxValue: CtxValue) => TeardownFn
    : never extends CtxValue
    ? (key: KeyValue) => TeardownFn
    : (key: KeyValue, ctxValue: CtxValue) => TeardownFn
  withTypes: <NewCtxValue, NewKeyValue = KeyValue>() => RootNode<
    NewCtxValue,
    KeyName,
    NewKeyValue
  >
}

export function createRoot(): RootNode<never, "", unknown>
export function createRoot<KeyName extends string = "">(
  keyName: KeyName,
): RootNode<never, KeyName, unknown>
export function createRoot<CtxValue, KeyName extends string, KeyValue>(
  keyName?: KeyName,
): RootNode<CtxValue, KeyName, KeyValue> {
  const contextValues = new Map<KeyValue, CtxValue>()
  const internalNode = createStateNode<
    RootNodeKey<KeyValue, KeyName>,
    CtxValue
  >(
    keyName ? [keyName] : [],
    [],
    (_getCtx, _getObs, key) =>
      of(contextValues.get(key[keyName!] ?? ("" as KeyValue))!), // TODO throw otherwise?
  )

  internalNode.public.getState$ = () => {
    throw new Error("RootNode doesn't have value")
  }
  internalNode.public.getValue = () => {
    throw new Error("RootNode doesn't have value")
  }

  const result: RootNode<CtxValue, KeyName, KeyValue> = Object.assign(
    internalNode.public as any,
    {
      run: (root?: KeyValue, ctxValue?: CtxValue) => {
        const key = (
          keyName
            ? {
                [keyName]: root,
              }
            : {}
        ) as RootNodeKey<KeyValue, KeyName>

        // TODO throw if instance already exists?
        const contextValueKey = root ?? ("" as KeyValue)
        contextValues.set(contextValueKey, ctxValue!)

        internalNode.addInstance(key)
        internalNode.activateInstance(key)
        return () => {
          internalNode.removeInstance(key)
          contextValues.delete(contextValueKey)
        }
      },
      withTypes: () => result as any,
    },
  )
  return result
}
