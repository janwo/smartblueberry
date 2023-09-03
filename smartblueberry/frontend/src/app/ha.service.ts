import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { catchError, from, map, mergeMap, of, tap, throwError } from 'rxjs'
import { environment } from 'src/environments/environment'
import { ERR_HASS_HOST_REQUIRED, getAuth } from 'home-assistant-js-websocket'
import { ActivatedRoute, Router } from '@angular/router'

export interface GlobalConnectionResponse {
  connected: boolean
  client_name: string
}

export type AuthResponse =
  | {
      success: true
      mode: 'bearer'
      bearer: string
    }
  | {
      success: true
      mode: 'supervised'
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

export interface GetItemListResponse {
  data: Item[]
}

export interface GetSingleItemResponse {
  data: Item
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
  providedIn: 'root'
})
export class HAService {
  private globalConnection: string | undefined = undefined

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
          this.http.post<AuthResponse>(
            authUrl,
            {
              access_token,
              refresh_token,
              expires_in,
              expires
            },
            this.getOptions({ withoutBearer: true })
          )
      ),
      catchError((err) => {
        switch (err) {
          case 2:
          case ERR_HASS_HOST_REQUIRED:
            return this.http
              .post<AuthResponse>(authUrl, undefined, this.getOptions())
              .pipe(
                tap(async ({ body }) => {
                  if (!body?.success && allowOAuthCall) {
                    await getAuth({ hassUrl: body!.hassUrl })
                  }
                })
              )
        }
        return throwError(() => err)
      }),
      tap(async ({ body }) => {
        // Update authentication state
        if (body?.success) {
          localStorage.setItem('auth-mode', body.mode)
          if (body.mode == 'bearer') {
            localStorage.setItem('auth-bearer', body.bearer)
          }

          this.checkGlobalConnection()
        } else {
          this.unauthenticate()
        }

        // remove authentication query params
        await this.router.navigate([], {
          replaceUrl: true,
          relativeTo: this.route,
          queryParams: Object.fromEntries(
            Object.entries(this.route.snapshot.queryParams).filter(
              ([param]) => !['auth_callback', 'code', 'state'].includes(param)
            )
          )
        })
      })
    )
  }

  unsetGlobalConnection() {
    const authUrl = `${environment.API_URL()}/unset-global-connection`
    this.http
      .post<GlobalConnectionResponse>(authUrl, undefined, this.getOptions())
      .subscribe({
        next: ({ body }) => {
          this.globalConnection = body?.connected ? body.client_name : undefined
        },
        error: (error) => {
          console.error(error)
        }
      })
  }

  setGlobalConnection() {
    const authUrl = `${environment.API_URL()}/set-global-connection`
    this.http
      .post<GlobalConnectionResponse>(authUrl, undefined, this.getOptions())
      .subscribe({
        next: ({ body }) => {
          this.globalConnection = body?.connected ? body.client_name : undefined
        },
        error: (error) => {
          console.error(error)
        }
      })
  }

  checkGlobalConnection() {
    const authUrl = `${environment.API_URL()}/global-connection`
    if (this.isAuthenticated()) {
      this.http
        .get<GlobalConnectionResponse>(authUrl, this.getOptions())
        .subscribe({
          next: ({ body }) => {
            this.globalConnection = body?.connected
              ? body.client_name
              : undefined
          },
          error: (error) => {
            console.error(error)
            this.globalConnection = undefined
          }
        })
      return
    }

    this.globalConnection = undefined
  }

  public isGloballyConnected() {
    return !!this.globalConnection
  }

  public getGlobalConnectionName() {
    return this.globalConnection
  }

  public isAuthenticated() {
    const mode = localStorage.getItem('auth-mode')
    switch (mode) {
      case 'bearer':
        return !!localStorage.getItem('auth-bearer')
      case 'supervised':
        return true
    }

    return false
  }

  public isSupervised() {
    const mode = localStorage.getItem('auth-mode')
    return mode == 'supervised'
  }

  public unauthenticate() {
    localStorage.removeItem('auth-mode')
    localStorage.removeItem('auth-bearer')
    this.checkGlobalConnection()
  }

  private getOptions(options = { withoutBearer: false }) {
    const httpOptions = { observe: 'response' as 'response' }
    if (options.withoutBearer != true) {
      const mode = localStorage.getItem('auth-mode')
      const bearer = localStorage.getItem('auth-bearer')
      if (mode == 'bearer' && bearer) {
        return {
          ...httpOptions,
          headers: {
            Authorization: `Bearer ${bearer}`
          }
        }
      }
    }

    return httpOptions
  }

  public get<ResponseBody>(url: string) {
    return this.http.get<{ data: ResponseBody }>(
      `${environment.API_URL()}${url}`,
      this.getOptions()
    )
  }

  public post<ResponseBody>(url: string, bodyJson: any) {
    return this.http.post<{ data: ResponseBody }>(
      `${environment.API_URL()}${url}`,
      bodyJson,
      this.getOptions()
    )
  }

  public delete<ResponseBody>(url: string, bodyJson: any) {
    return this.http.delete<{ data: ResponseBody }>(
      `${environment.API_URL()}${url}`,
      { body: bodyJson, ...this.getOptions() }
    )
  }
}

export const RouteGuard = {
  isGloballyConnected: () => {
    return inject(HAService).isGloballyConnected()
  },
  isAuthenticated: () => {
    return inject(HAService).isAuthenticated()
  }
}
