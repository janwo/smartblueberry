import { Injectable } from "@angular/core"
import { HttpClient } from "@angular/common/http"
import { catchError, from, map, mergeMap, tap, throwError } from "rxjs"
import { environment } from "src/environments/environment"
import { ERR_HASS_HOST_REQUIRED, getAuth } from "home-assistant-js-websocket"
import { ActivatedRoute, Router } from "@angular/router"

export interface GlobalConnectionResponse {
  connected: boolean
}

export interface GetItemListResponse {
  data: Item[]
}

export interface GetSingleItemResponse {
  data: Item
}

export type AuthResponse =
  | {
      success: true
      bearer: string
    }
  | {
      success: false
      error: string
      hassUrl: string
    }

export interface PostPutDeleteResponse {
  success: boolean
  error?: string
}

export interface Item {
  name: string
  label: string
  state: string
  link: string
  members?: Item[]
  jsonStorage?: { [key: string]: any }
  stateDescription?: { options: [{ value: string; label: string }] }
}

@Injectable({
  providedIn: "root",
})
export class HAService {
  private get bearer() {
    return localStorage.getItem("bearer")
  }

  private set bearer(bearer: string | null) {
    if (bearer === null) {
      localStorage.removeItem("bearer")
    } else {
      localStorage.setItem("bearer", bearer)
    }
  }

  private authenticated = false

  constructor(
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  authenticate({ allowOAuthCall } = { allowOAuthCall: false }) {
    const authUrl = `${environment.API_URL()}/authenticate`
    return from(getAuth()).pipe(
      mergeMap(
        ({ data: { access_token, refresh_token, expires, expires_in } }) =>
          this.http.post<AuthResponse>(authUrl, {
            access_token,
            refresh_token,
            expires_in,
            expires,
          })
      ),
      catchError((err) => {
        switch (err) {
          case 2:
          case ERR_HASS_HOST_REQUIRED:
            return this.http
              .post<AuthResponse>(authUrl, undefined, this.getOptions())
              .pipe(
                tap(async (response) => {
                  if (!response.success && allowOAuthCall) {
                    await getAuth({ hassUrl: response.hassUrl })
                  }
                })
              )
        }
        return throwError(() => err)
      }),
      tap(async (response) => {
        // Update authentication state
        if (response.success) {
          this.authenticated = true
          this.bearer = response.bearer
        } else {
          this.authenticated = false
          this.bearer = null
        }

        // remove authentication query params
        await this.router.navigate([], {
          replaceUrl: true,
          relativeTo: this.route,
          queryParams: Object.fromEntries(
            Object.entries(this.route.snapshot.queryParams).filter(
              ([param]) => !["auth_callback", "code", "state"].includes(param)
            )
          ),
        })
      })
    )
  }

  setGlobalConnection(unset = false) {
    const authUrl = `${environment.API_URL()}/${
      unset ? "unset" : "set"
    }-global-connection`
    this.http
      .post<AuthResponse>(authUrl, undefined, this.getOptions())
      .subscribe()
  }

  isGloballyConnected() {
    const authUrl = `${environment.API_URL()}/global-connection`
    return this.http
      .get<GlobalConnectionResponse>(authUrl, this.getOptions())
      .pipe(map(({ connected }) => connected))
  }

  public isAuthenticated() {
    return this.authenticated
  }

  public unauthenticate() {
    this.bearer = null
    this.authenticated = false
  }

  private getOptions() {
    if (!this.bearer) {
      return {}
    }
    return {
      headers: {
        Authorization: `Bearer ${this.bearer}`,
      },
    }
  }

  public general = {
    itemsMap: () => {
      return this.http.get<{ data: { [key: string]: string } }>(
        `${environment.API_URL()}/items-map`,
        this.getOptions()
      )
    },
  }

  public light = {
    switchableItems: () => {
      return this.http.get<GetItemListResponse>(
        `${environment.API_URL()}/light-switchable-items`,
        this.getOptions()
      )
    },
    measurementItems: () => {
      return this.http.get<GetItemListResponse>(
        `${environment.API_URL()}/light-measurement-items`,
        this.getOptions()
      )
    },
    astroItems: () => {
      return this.http.get<GetItemListResponse>(
        `${environment.API_URL()}/light-astro-items`,
        this.getOptions()
      )
    },
  }

  public irrigation = {
    apiSettings: () => {
      return this.http.get<{
        data: {
          latitude: number
          longitude: number
          syncedLocation: boolean
          hasApiKey: boolean
        }
      }>(`${environment.API_URL()}/irrigation-api`, this.getOptions())
    },
    updateApiSettings: (apiSettings: {
      api?: string
      syncLocation?: boolean
    }) => {
      return this.http.post<PostPutDeleteResponse>(
        `${environment.API_URL()}/irrigation-api`,
        { apiSettings },
        this.getOptions()
      )
    },
    deleteApiSettings: () => {
      return this.http.delete<PostPutDeleteResponse>(
        `${environment.API_URL()}/irrigation-api`,
        this.getOptions()
      )
    },
    triggerItems: () => {
      return this.http.get<GetItemListResponse>(
        `${environment.API_URL()}/irrigation-trigger-items`,
        this.getOptions()
      )
    },
    valveItems: () => {
      return this.http.get<GetItemListResponse>(
        `${environment.API_URL()}/irrigation-valve-items`,
        this.getOptions()
      )
    },
    updateValveItems: (
      item: string,
      irrigationValues: {
        waterVolumePerMinute: number
        overshootDays: number
        evaporationFactor: number
        minimalTemperature?: string
        observedDays: number
      }
    ) => {
      return this.http.post<PostPutDeleteResponse>(
        `${environment.API_URL()}/irrigation-valve-items/${item}`,
        { irrigationValues },
        this.getOptions()
      )
    },
    deleteValveItems: (item: string) => {
      return this.http.delete<PostPutDeleteResponse>(
        `${environment.API_URL()}/irrigation-valve-items/${item}`,
        this.getOptions()
      )
    },
  }

  public security = {
    lockItems: () => {
      return this.http.get<GetItemListResponse>(
        `${environment.API_URL()}/security-lock-items`,
        this.getOptions()
      )
    },
    lockClosureItems: () => {
      return this.http.get<GetItemListResponse>(
        `${environment.API_URL()}/security-lock-closure-items`,
        this.getOptions()
      )
    },
    assaultAlarmItems: () => {
      return this.http.get<GetItemListResponse>(
        `${environment.API_URL()}/security-assault-alarm-items`,
        this.getOptions()
      )
    },
    smokeTriggerItems: () => {
      return this.http.get<GetItemListResponse>(
        `${environment.API_URL()}/security-smoke-trigger-items`,
        this.getOptions()
      )
    },
    assaultTriggerItems: () => {
      return this.http.get<GetItemListResponse>(
        `${environment.API_URL()}/security-assault-trigger-items`,
        this.getOptions()
      )
    },
    assaultDisarmerItems: () => {
      return this.http.get<GetItemListResponse>(
        `${environment.API_URL()}/security-assault-disarmer-items`,
        this.getOptions()
      )
    },
  }

  public scene = {
    items: () => {
      return this.http.get<GetItemListResponse>(
        `${environment.API_URL()}/scene-items`,
        this.getOptions()
      )
    },
    updateCustomMembers: (item: string, customMembers: string[]) => {
      return this.http.post<PostPutDeleteResponse>(
        `${environment.API_URL()}/scene-item/${item}/custom-members`,
        { customMembers },
        this.getOptions()
      )
    },
    deleteCustomMembers: (item: string) => {
      return this.http.delete<PostPutDeleteResponse>(
        `${environment.API_URL()}/scene-item/${item}/custom-members`,
        this.getOptions()
      )
    },
    updateContextStates: (
      item: string,
      contextStates: { [key: string]: string }
    ) => {
      return this.http.post<PostPutDeleteResponse>(
        `${environment.API_URL()}/scene-item/${item}/context-states`,
        { contextStates },
        this.getOptions()
      )
    },
    deleteContextStates: (item: string) => {
      return this.http.delete<PostPutDeleteResponse>(
        `${environment.API_URL()}/scene-item/${item}/context-states`,
        this.getOptions()
      )
    },
    triggerItems: () => {
      return this.http.get<GetItemListResponse>(
        `${environment.API_URL()}/scene-trigger-items`,
        this.getOptions()
      )
    },
    updateTriggerState: (
      item: string,
      triggerState: {
        targetScene: string
        to: any
        from?: any
        states?: any[]
        hoursUntilActive?: number
        minutesUntilActive?: number
        secondsUntilActive?: number
      }
    ) => {
      triggerState.states = triggerState.states?.length
        ? triggerState.states
        : undefined
      return this.http.post<PostPutDeleteResponse>(
        `${environment.API_URL()}/scene-trigger-item/${item}/trigger-state`,
        { triggerState },
        this.getOptions()
      )
    },
    deleteTriggerState: (item: string) => {
      return this.http.delete<PostPutDeleteResponse>(
        `${environment.API_URL()}/scene-trigger-item/${item}/trigger-state`,
        this.getOptions()
      )
    },
  }

  public presence = {
    items: () => {
      return this.http.get<GetItemListResponse>(
        `${environment.API_URL()}/presence-items`,
        this.getOptions()
      )
    },
    updateStates: (
      item: string,
      states: { absence?: any[]; presence?: any[] }
    ) => {
      return this.http.post<PostPutDeleteResponse>(
        `${environment.API_URL()}/presence-item/${item}/states`,
        states,
        this.getOptions()
      )
    },
    deleteStates: (item: string) => {
      return this.http.delete<PostPutDeleteResponse>(
        `${environment.API_URL()}/presence-item/${item}/states`,
        this.getOptions()
      )
    },
  }

  public climate = {
    modeItems: () => {
      return this.http.get<GetItemListResponse>(
        `${environment.API_URL()}/heating-mode-items`,
        this.getOptions()
      )
    },
    contactSwitchableItems: () => {
      return this.http.get<GetItemListResponse>(
        `${environment.API_URL()}/heating-contact-switchable-items`,
        this.getOptions()
      )
    },
    updateCommandMap: (
      item: string,
      commandMap: { on: any; off: any; power: any; eco: any }
    ) => {
      return this.http.post<PostPutDeleteResponse>(
        `${environment.API_URL()}/heating-mode-item/${item}/command-map`,
        { commandMap },
        this.getOptions()
      )
    },
    deleteCommandMap: (item: string) => {
      return this.http.delete<PostPutDeleteResponse>(
        `${environment.API_URL()}/heating-mode-item/${item}/command-map`,
        this.getOptions()
      )
    },
  }
}
