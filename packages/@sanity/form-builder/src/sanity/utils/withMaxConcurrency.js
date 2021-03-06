// @flow

// Takes a observable-returning function and returns a new function that limits on the number of
// concurrent observables.

import Multicast from '@sanity/observable/multicast'
import Observable from '@sanity/observable'
import type {ObservableI, Subscription} from '../../typedefs/observable'

const DEFAULT_CONCURRENCY = 4

function remove<T>(array: Array<T>, item: T): Array<T> {
  const index = array.indexOf(item)
  if (index > -1) {
    array.splice(index, 1)
  }
  return array
}

export function withMaxConcurrency(
  func: any => ObservableI<*>,
  concurrency: number = DEFAULT_CONCURRENCY
) {
  const throttler = createThrottler(concurrency)
  return (...args: Array<any>) => Observable.from(throttler(func(...args)))
}

export function createThrottler(concurrency: number = DEFAULT_CONCURRENCY) {
  const currentSubscriptions: Array<Subscription> = []
  const pendingObservables: Array<ObservableI<*>> = []
  const ready$ = new Multicast()

  return request

  function request(observable: ObservableI<*>) {
    return new Observable(observer => {
      if (currentSubscriptions.length >= concurrency) {
        return scheduleAndWait(observable)
          .mergeMap(request)
          .subscribe(observer)
      }
      const subscription = observable.subscribe(observer)
      currentSubscriptions.push(subscription)
      return () => {
        remove(currentSubscriptions, subscription)
        remove(pendingObservables, observable)
        subscription.unsubscribe()
        check()
      }
    })
  }

  function scheduleAndWait(observable) {
    pendingObservables.push(observable)
    return ready$.asObservable().first(obs => obs === observable)
  }

  function check() {
    while (pendingObservables.length > 0 && currentSubscriptions.length < concurrency) {
      ready$.next(pendingObservables.shift())
    }
  }
}
