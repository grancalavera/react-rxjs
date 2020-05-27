import { useEffect, useState } from "react"
import { Observable, of, race } from "rxjs"
import { delay, take, mapTo } from "rxjs/operators"
import {
  StaticObservableOptions,
  defaultStaticOptions,
} from "./connectObservable"
import distinctShareReplay from "./operators/distinct-share-replay"
import reactOptimizations from "./operators/react-optimizations"

interface FactoryObservableOptions<T> extends StaticObservableOptions<T> {
  suspenseTime: number
}

const defaultOptions: FactoryObservableOptions<any> = {
  ...defaultStaticOptions,
  suspenseTime: 200,
}

export function connectFactoryObservable<
  I,
  A extends (number | string | boolean | null)[],
  O
>(
  getObservable: (...args: A) => Observable<O>,
  initialValue: I,
  options?: Partial<FactoryObservableOptions<O>>,
): [(...args: A) => O | I, (...args: A) => Observable<O>] {
  const { suspenseTime, unsubscribeGraceTime, compare } = {
    ...defaultOptions,
    ...options,
  }

  const reactEnhander = reactOptimizations(unsubscribeGraceTime)
  const cache = new Map<string, Observable<O>>()

  const getSharedObservable$ = (...input: A): Observable<O> => {
    const key = JSON.stringify(input)
    const cachedVal = cache.get(key)

    if (cachedVal !== undefined) {
      return cachedVal
    }

    const reactObservable$ = getObservable(...input).pipe(
      distinctShareReplay(compare, () => {
        cache.delete(key)
      }),
    )

    cache.set(key, reactObservable$)
    return reactObservable$
  }

  return [
    (...input: A) => {
      const [value, setValue] = useState<I | O>(initialValue)

      useEffect(() => {
        const sharedObservable$ = getSharedObservable$(...input)
        const subscription = reactEnhander(sharedObservable$).subscribe(
          setValue,
        )

        if (suspenseTime === 0) {
          setValue(initialValue)
        } else if (suspenseTime < Infinity) {
          subscription.add(
            race(
              of(initialValue).pipe(delay(suspenseTime)),
              sharedObservable$.pipe(
                take(1),
                mapTo((x: I | O) => x),
              ),
            ).subscribe(setValue),
          )
        }

        return () => subscription.unsubscribe()
      }, input)

      return value
    },
    getSharedObservable$,
  ]
}
