import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpResponse } from '@angular/common/http'
import {
  Observable,
  catchError,
  from,
  map,
  mergeMap,
  of,
  share,
  shareReplay,
  tap,
  throwError
} from 'rxjs'
import { environment } from 'src/environments/environment'
import { ERR_HASS_HOST_REQUIRED, getAuth } from 'home-assistant-js-websocket'
import { ActivatedRoute, Router } from '@angular/router'

export type ValidAuthResponse =
  | { mode: 'bearer'; bearer: string }
  | { mode: 'supervised' }

export type InvalidAuthResponse = { error: string; hassUrl: string }

export interface GlobalConnectionResponse {
  connected: boolean
  client_name: string
}

@Injectable({
  providedIn: 'root'
})
export class HAService {
  private globalConnectionName: string | undefined = undefined
  private options$?: Observable<any>

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
          this.http.post(
            authUrl,
            {
              access_token,
              refresh_token,
              expires_in,
              expires
            },
            this.getHttpOptions({ withoutBearer: true })
          )
      ),
      catchError((err) => {
        switch (err) {
          case 2:
          case ERR_HASS_HOST_REQUIRED:
            return this.http
              .post(authUrl, undefined, this.getHttpOptions())
              .pipe(
                tap(async (response) => {
                  if (
                    response.ok &&
                    response.status !== 200 &&
                    allowOAuthCall
                  ) {
                    const { hassUrl } = response.body as InvalidAuthResponse
                    await getAuth({ hassUrl })
                  }
                })
              )
        }
        return throwError(() => err)
      }),
      tap(async (response) => {
        // Update authentication state
        if (response.ok && response.status == 200) {
          const body = response.body as ValidAuthResponse
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
      .post<GlobalConnectionResponse>(authUrl, undefined, this.getHttpOptions())
      .subscribe({
        next: ({ body }) => {
          this.globalConnectionName = body?.connected
            ? body.client_name
            : undefined
        },
        error: (error) => {
          console.error(error)
        }
      })
  }

  setGlobalConnection() {
    const authUrl = `${environment.API_URL()}/set-global-connection`
    this.http
      .post<GlobalConnectionResponse>(authUrl, undefined, this.getHttpOptions())
      .subscribe({
        next: ({ body }) => {
          this.globalConnectionName = body?.connected
            ? body.client_name
            : undefined
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
        .get<GlobalConnectionResponse>(authUrl, this.getHttpOptions())
        .subscribe({
          next: ({ body }) => {
            this.globalConnectionName = body?.connected
              ? body.client_name
              : undefined
          },
          error: (error) => {
            console.error(error)
            this.globalConnectionName = undefined
          }
        })
      return
    }

    this.globalConnectionName = undefined
  }

  public isGloballyConnected() {
    return !!this.globalConnectionName
  }

  public getGlobalConnectionName() {
    return this.globalConnectionName
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

  public getOptions(): Observable<any> {
    if (!this.options$) {
      this.options$ = this.get('/options').pipe(
        map(({ body }) => body),
        shareReplay(1)
      )
    }
    return this.options$
  }

  private getHttpOptions(options = { withoutBearer: false }) {
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

  public get<ResponseBody = null>(url: string) {
    return this.http.get<ResponseBody>(
      `${environment.API_URL()}${url}`,
      this.getHttpOptions()
    )
  }

  public post<ResponseBody = null>(url: string, bodyJson: any) {
    return this.http.post<ResponseBody>(
      `${environment.API_URL()}${url}`,
      bodyJson,
      this.getHttpOptions()
    )
  }

  public delete<ResponseBody = null>(url: string, bodyJson: any) {
    return this.http.delete<ResponseBody>(`${environment.API_URL()}${url}`, {
      body: bodyJson,
      ...this.getHttpOptions()
    })
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
