import React, { useEffect, useState } from "react"
import {
  Sun,
  Moon,
  Cloud,
  CloudSun,
  CloudMoon,
  CloudRain,
  CloudDrizzle,
  CloudSnow,
  CloudLightning,
  CloudFog,
  Droplets,
  Wind,
  type LucideIcon,
} from "lucide-react"

// Hampton, VA
const LAT = 37.0299
const LON = -76.3452
const REFRESH_MS = 15 * 60 * 1000 // refresh every 15 minutes

interface WeatherData {
  temp: number
  feelsLike: number
  code: number
  isDay: boolean
  wind: number
  high: number
  low: number
  precipChance: number
  hourly: {
    time: Date
    temp: number
    code: number
    isDay: boolean
    precip: number
  }[]
}

function describe(
  code: number,
): { label: string; icon: LucideIcon; nightIcon?: LucideIcon } {
  if (code === 0) return { label: "Clear", icon: Sun, nightIcon: Moon }
  if (code === 1) return { label: "Mostly Clear", icon: Sun, nightIcon: Moon }
  if (code === 2)
    return { label: "Partly Cloudy", icon: CloudSun, nightIcon: CloudMoon }
  if (code === 3) return { label: "Overcast", icon: Cloud }
  if (code === 45 || code === 48) return { label: "Fog", icon: CloudFog }
  if (code >= 51 && code <= 57) return { label: "Drizzle", icon: CloudDrizzle }
  if (code >= 61 && code <= 67) return { label: "Rain", icon: CloudRain }
  if (code >= 71 && code <= 77) return { label: "Snow", icon: CloudSnow }
  if (code >= 80 && code <= 82)
    return { label: "Rain Showers", icon: CloudRain }
  if (code === 85 || code === 86)
    return { label: "Snow Showers", icon: CloudSnow }
  if (code >= 95) return { label: "Thunderstorms", icon: CloudLightning }
  return { label: "Cloudy", icon: Cloud }
}

function iconFor(code: number, isDay: boolean): LucideIcon {
  const d = describe(code)
  return !isDay && d.nightIcon ? d.nightIcon : d.icon
}

export default function WeatherForecast() {
  const [data, setData] = useState<WeatherData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const url =
          `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
          `&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m` +
          `&hourly=temperature_2m,weather_code,is_day,precipitation_probability` +
          `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
          `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FNew_York&forecast_days=2`
        const res = await fetch(url)
        if (!res.ok) throw new Error("weather http " + res.status)
        const j = await res.json()

        const hourly = (j.hourly.time as string[]).map((t, i) => ({
          time: new Date(t),
          temp: Math.round(j.hourly.temperature_2m[i]),
          code: j.hourly.weather_code[i] as number,
          isDay: j.hourly.is_day[i] === 1,
          precip: (j.hourly.precipitation_probability[i] ?? 0) as number,
        }))

        if (cancelled) return
        setData({
          temp: Math.round(j.current.temperature_2m),
          feelsLike: Math.round(j.current.apparent_temperature),
          code: j.current.weather_code,
          isDay: j.current.is_day === 1,
          wind: Math.round(j.current.wind_speed_10m),
          high: Math.round(j.daily.temperature_2m_max[0]),
          low: Math.round(j.daily.temperature_2m_min[0]),
          precipChance: j.daily.precipitation_probability_max[0] ?? 0,
          hourly,
        })
        setError(false)
      } catch {
        // Keep showing last good data if we have it
        if (!cancelled) setError(true)
      }
    }

    load()
    const id = setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  if (!data) {
    return (
      <div className="w-full mt-3 px-3 py-2 rounded-xl bg-white border border-[#02275A]/20 text-center text-[10px] text-[#02275A]/70 shadow-xs">
        {error ? "Forecast unavailable" : "Loading forecast…"}
      </div>
    )
  }

  const now = new Date()
  // Next 4 time slots, every 3 hours, starting from the next full hour
  const upcoming = data.hourly.filter((h) => h.time.getTime() > now.getTime())
  const slots = [2, 5, 8, 11].map((i) => upcoming[i]).filter(Boolean)

  const NowIcon = iconFor(data.code, data.isDay)

  return (
    <div className="w-full mt-3 rounded-xl bg-white border border-[#02275A]/20 shadow-xs overflow-hidden">
      {/* Current conditions */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-2">
        <div className="flex items-center gap-2.5">
          <NowIcon className="w-8 h-8 text-[#02275A]" strokeWidth={1.75} />
          <div className="flex flex-col leading-tight">
            <span className="text-2xl font-black tabular-nums text-[#02275A]">
              {data.temp}°F
            </span>
            <span className="text-[10px] font-semibold text-slate-600">
              {describe(data.code).label} · Feels {data.feelsLike}°
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-0.5 text-[10px] font-semibold">
          <span className="text-[#02275A]">
            H <span className="text-amber-600 font-extrabold">{data.high}°</span>
            <span className="text-slate-300 mx-1">/</span>L{" "}
            <span className="text-[#02275A] font-extrabold">{data.low}°</span>
          </span>
          <span className="flex items-center gap-1 text-slate-600">
            <Droplets className="w-3 h-3 text-[#02275A]" />
            {data.precipChance}% rain
          </span>
          <span className="flex items-center gap-1 text-slate-600">
            <Wind className="w-3 h-3 text-[#02275A]" />
            {data.wind} mph
          </span>
        </div>
      </div>

      {/* Forecast for the rest of the day */}
      {slots.length > 0 && (
        <div className="grid grid-cols-4 border-t border-[#02275A]/15 bg-[#F8FBFE]">
          {slots.map((h) => {
            const Icon = iconFor(h.code, h.isDay)
            const label = h.time
              .toLocaleTimeString([], { hour: "numeric" })
              .replace(" ", "")
            return (
              <div
                key={h.time.toISOString()}
                className="flex flex-col items-center gap-0.5 py-1.5"
              >
                <span className="text-[9px] font-bold uppercase text-slate-500">
                  {label}
                </span>
                <Icon className="w-4 h-4 text-[#02275A]" strokeWidth={1.75} />
                <span className="text-[11px] font-black text-[#02275A] tabular-nums">
                  {h.temp}°
                </span>
                <span className="text-[8px] text-[#02275A] font-extrabold">
                  {h.precip}%
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
