const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'content-type': 'application/json',
  'x-cache': 'HIT',
};

export const currentWeather = {
  location: 'Rosario',
  temperature_c: 31,
  feels_like_c: 33.8,
  humidity: 58,
  conditions: 'Parcialmente nublado',
  wind_speed_kmh: 5.8,
  precipitation_mm: 0,
  updated_at: '2026-11-16T17:38:00-03:00',
};

export const hourlyForecast = {
  location: 'Rosario',
  hours: Array.from({ length: 24 }, (_, index) => {
    const moment = new Date(Date.UTC(2026, 10, 19, 14 + index));
    return {
      datetime: moment.toISOString().slice(0, 19),
      temperature_c: 31 - Math.floor(index / 4),
      feels_like_c: 32 - Math.floor(index / 4),
      humidity: 58,
      precipitation_mm: 0,
      precipitation_probability: index < 4 ? 52 : 10,
      conditions: index < 4 ? 'Lluvia' : 'Parcialmente nublado',
      wind_speed_kmh: 8,
      icon: index < 4 ? 'rain' : 'partly-cloudy-day',
    };
  }),
};

export const forecast = {
  location: 'Rosario',
  days: [
    {
      date: '2026-11-16',
      temp_max_c: 33,
      temp_min_c: 19,
      temp_c: 26,
      precipitation_mm: 0,
      precipitation_probability: 97,
      conditions: 'Lluvia',
      wind_speed_kmh: 10,
      sunrise: '06:00',
      sunset: '20:00',
    },
    {
      date: '2026-11-17',
      temp_max_c: 29,
      temp_min_c: 20,
      temp_c: 24,
      precipitation_mm: 0,
      precipitation_probability: 97,
      conditions: 'Lluvia',
      wind_speed_kmh: 12,
      sunrise: '06:01',
      sunset: '20:01',
    },
    {
      date: '2026-11-18',
      temp_max_c: 26,
      temp_min_c: 19,
      temp_c: 22,
      precipitation_mm: 0,
      precipitation_probability: 26,
      conditions: 'Nublado',
      wind_speed_kmh: 8,
      sunrise: '06:02',
      sunset: '20:02',
    },
    {
      date: '2026-11-19',
      temp_max_c: 26,
      temp_min_c: 17,
      temp_c: 21,
      precipitation_mm: 0,
      precipitation_probability: 16,
      conditions: 'Nublado',
      wind_speed_kmh: 9,
      sunrise: '06:03',
      sunset: '20:03',
    },
    {
      date: '2026-11-20',
      temp_max_c: 27,
      temp_min_c: 17,
      temp_c: 22,
      precipitation_mm: 0,
      precipitation_probability: 26,
      conditions: 'Nublado',
      wind_speed_kmh: 7,
      sunrise: '06:04',
      sunset: '20:04',
    },
  ],
};

const nominatimSearch = [
  {
    place_id: 16456461,
    lat: '-32.9593609',
    lon: '-60.6617024',
    display_name:
      'Rosario, Municipio de Rosario, Gran Rosario, Departamento Rosario, Santa Fe, Argentina',
    address: {
      city: 'Rosario',
      municipality: 'Municipio de Rosario',
      state: 'Santa Fe',
      country: 'Argentina',
    },
  },
];

const nominatimReverse = {
  name: 'Rosario',
  display_name:
    'Rosario, Municipio de Rosario, Gran Rosario, Departamento Rosario, Santa Fe, Argentina',
  address: {
    city: 'Rosario',
    municipality: 'Municipio de Rosario',
    state: 'Santa Fe',
    country: 'Argentina',
  },
};

const openMeteoSearch = {
  results: [
    {
      id: 3838583,
      name: 'Rosario',
      latitude: -32.94682,
      longitude: -60.63932,
      country: 'Argentina',
      admin1: 'Provincia de Santa Fe',
      admin2: 'Departamento de Rosario',
    },
  ],
};

export async function blockExtras(page) {
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ status: 204, body: '' }),
  );
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
  await page.route('https://umami.fabricioporcelli.com.ar/**', (route) =>
    route.abort(),
  );
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.abort(),
  );
}

export async function mockWeatherApi(page) {
  await page.route('http://localhost:8000/v1/weather/**', (route) =>
    route.fulfill({
      status: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(currentWeather),
    }),
  );
  await page.route('http://localhost:8000/v1/forecast/**', (route) =>
    route.fulfill({
      status: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(forecast),
    }),
  );
  await page.route('http://localhost:8000/v1/hourly/**', (route) =>
    route.fulfill({
      status: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(hourlyForecast),
    }),
  );
}

export async function mockGeocoding(page, { nominatimFails = false } = {}) {
  await page.route('https://nominatim.openstreetmap.org/search**', (route) =>
    nominatimFails
      ? route.abort('failed')
      : route.fulfill({
          status: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify(nominatimSearch),
        }),
  );
  await page.route('https://nominatim.openstreetmap.org/reverse**', (route) =>
    nominatimFails
      ? route.abort('failed')
      : route.fulfill({
          status: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify(nominatimReverse),
        }),
  );
  await page.route('https://geocoding-api.open-meteo.com/**', (route) =>
    route.fulfill({
      status: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(openMeteoSearch),
    }),
  );
}

export async function searchRosario(page) {
  await page.getByLabel('Nombre de la ciudad o pueblo').fill('Rosario');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expectCurrentWeather(page);
}

export async function expectCurrentWeather(page) {
  await page.locator('#current-card').waitFor({ state: 'visible' });
  await page.locator('#current-location').waitFor({ state: 'visible' });
}
