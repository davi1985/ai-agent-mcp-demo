import type { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'

const WEATHER_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow fall',
  73: 'Moderate snow fall',
  75: 'Heavy snow fall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
}

interface GeoResult {
  latitude: number
  longitude: number
  name: string
  country?: string
  admin1?: string
}

interface WeatherJson {
  current: {
    temperature_2m: number
    relative_humidity_2m: number
    apparent_temperature: number
    weather_code: number
    wind_speed_10m: number
  }
}

export function registerWeatherTool(server: McpServer): void {
  server.registerTool(
    'get_weather',
    {
      description:
        'Get the current weather for a city. Returns temperature, humidity, wind speed and conditions. Use this whenever the user asks about the weather or temperature anywhere in the world.',
      inputSchema: z.object({
        city: z.string().min(1).max(80).describe('City name, e.g. "São Paulo"'),
        country: z
          .string()
          .optional()
          .describe(
            'Optional country to disambiguate cities with the same name',
          ),
      }),
    },
    async ({ city, country }) => {
      const text = await fetchWeather(city, country)
      return text.startsWith('ERROR')
        ? { content: [{ type: 'text', text: text.slice(6) }], isError: true }
        : { content: [{ type: 'text', text }] }
    },
  )
}

async function fetchWeather(city: string, country?: string): Promise<string> {
  try {
    const params = new URLSearchParams({
      name: city,
      count: '10',
      language: 'en',
      format: 'json',
    })
    const geoRes = await fetch(`${GEOCODING_URL}?${params}`, {
      headers: { 'User-Agent': 'mcp-agent-demo/1.0' },
    })
    if (!geoRes.ok)
      return `ERROR Weather lookup failed (HTTP ${geoRes.status}).`

    const geoJson = (await geoRes.json()) as { results?: GeoResult[] }
    const results = geoJson.results ?? []
    const normalize = (s: string) =>
      s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

    const requested = normalize(city)

    const match =
      results.find(
        (r) =>
          normalize(r.name) === requested &&
          (!country || r.country?.toLowerCase().includes(country.toLowerCase())),
      )

    if (!match)
      return `ERROR City "${city}"${country ? ` in ${country}` : ''} not found. Please check the spelling.`

    const location = [match.name, match.admin1, match.country]
      .filter(Boolean)
      .join(', ')

    const forecastParams = new URLSearchParams({
      latitude: String(match.latitude),
      longitude: String(match.longitude),
      current:
        'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
    })
    const forecastRes = await fetch(`${FORECAST_URL}?${forecastParams}`, {
      headers: { 'User-Agent': 'mcp-agent-demo/1.0' },
    })
    if (!forecastRes.ok)
      return `ERROR Weather forecast failed (HTTP ${forecastRes.status}).`

    const forecast = (await forecastRes.json()) as WeatherJson
    const c = forecast.current
    const condition = WEATHER_CODES[c.weather_code] ?? `Code ${c.weather_code}`

    return [
      `Current weather in ${location}:`,
      `- Condition: ${condition}`,
      `- Temperature: ${c.temperature_2m}°C (feels like ${c.apparent_temperature}°C)`,
      `- Humidity: ${c.relative_humidity_2m}%`,
      `- Wind: ${c.wind_speed_10m} km/h`,
    ].join('\n')
  } catch (err) {
    return `ERROR Weather request failed: ${(err as Error).message}`
  }
}
