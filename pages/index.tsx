import styles from "@/styles/Home.module.css";

import "mapbox-gl/dist/mapbox-gl.css";
import { createRef, useCallback, useEffect, useRef, useState } from "react";

import * as O from "fp-ts/Option";
import * as E from "fp-ts/Either";
import * as TE from "fp-ts/TaskEither";

// @ts-ignore
import * as io from "socket.io-client";

import Map, { Marker, MapRef } from "react-map-gl";
import { pipe } from "fp-ts/lib/function";

const lat = 37.8;
const lng = -122.4;

const map_props = {
  mapStyle: "mapbox://styles/mapbox/streets-v9",
  initialViewState: {
    zoom: 14,
    latitude: lat,
    longitude: lng,
  },
};

const run = pipe(
  TE.tryCatch(
    () => navigator.permissions.query({ name: "geolocation" }),
    E.toError
  ),
  TE.chainEitherK((permission) =>
    permission.state === "denied"
      ? E.left(new Error("Location permission denied"))
      : E.right(permission)
  )
);

function useLocationPermission() {
  const [error, set_error] = useState<Error | null>(null);
  const [permission, set_permission] = useState<PermissionState | null>(null);

  const request = useCallback(() => {
    run().then(
      E.match(
        (err) => set_error(err),
        (permission) => set_permission(permission.state)
      )
    );
  }, []);

  useEffect(request, [request]);

  return { error, request, permission };
}

function useLocationUpdate(options?: PositionOptions) {
  const watch_id = useRef<number | null>(null);
  const [error, set_error] = useState<GeolocationPositionError | null>(null);
  const [position, set_location] = useState<GeolocationPosition | null>(null);

  const requestUpdate = useCallback(() => {
    const existing = watch_id.current;

    if (existing !== null) {
      navigator.geolocation.clearWatch(existing);
    }

    watch_id.current = navigator.geolocation.watchPosition(
      (position) => set_location(position),
      (err) => set_error(err),
      options
    );
  }, [options]);

  const stop = useCallback(() => {
    const existing = watch_id.current;

    if (existing !== null) {
      navigator.geolocation.clearWatch(existing);
    }
  }, []);

  useEffect(() => {
    const existing = watch_id.current;

    return () => {
      if (existing !== null) {
        navigator.geolocation.clearWatch(existing);
      }
    };
  }, []);

  return { stop, error, requestUpdate, position };
}

export function getServerSideProps() {
  const api_key = process.env.MAPBOX__API_KEY;

  return {
    props: {
      api_key,
    },
  };
}

export default function Home({ api_key }: { api_key: string }) {
  const { permission } = useLocationPermission();

  const { position, requestUpdate } = useLocationUpdate();

  const { coords } = position ?? {};

  const [local_map, set_local_map] = useState<MapRef | null>(null);
  const [remote_map, set_remote_map] = useState<MapRef | null>(null);

  const [socket] = useState(() => {
    return io("ws://34.172.18.184:8081/app?token=abc123", {
      upgrade: true,
      // path: "/app",
      transports: ["websocket"],
    });
  });

  // ws://34.172.18.184:8081/socket.io/?token=abc123&EIO=3&transport=websocket

  // ws://34.172.18.184:8081/socket.io/?token=abc123&EIO=3&transport=websocket

  // console.log(position);

  // useEffect(() => {
  //   if (permission !== "denied") requestUpdate();
  // }, [requestUpdate, permission]);

  // useEffect(() => {
  //   const { coords } = position ?? {};

  //   fetch("http://35.208.196.20:8000/webhook/v1/location", {
  //     method: "POST",
  //     body: JSON.stringify({
  //       ...coords,
  //       angle: 0,
  //       vehicleNo: 17,
  //       backlog: false,
  //       deviceId: 123456789,
  //       gpsTime: position?.timestamp,
  //       processingTime: position?.timestamp,
  //       apiKey: "JmOBYcwgbMocPGn0uTSbWDsaHuktxepFqzmhRDyz",
  //     }),
  //   })
  //     .then((r) => {
  //       console.log("sent", r);
  //     })
  //     .catch((r) => {
  //       console.log("error", r);
  //     });
  // }, [position]);

  useEffect(() => {
    const map = local_map;

    if (map && coords) {
      map.panTo({ lat: coords.latitude, lng: coords.longitude });
    }
  }, [coords, local_map]);

  useEffect(() => {
    socket.on("connect", () => {
      console.log("connected");
    });

    socket.on("connect_error", (err: any) => {
      console.log("connect error", err);

      // if (err.message === "invalid credentials") {
      //   socket.auth.token = "efgh";
      //   socket.connect();
      // }
    });

    socket.on("location", (ev: any) => {
      console.log(ev);
    });
  }, [socket]);

  return (
    <div className="h-full p-4 flex gap-4">
      {/* <div className={styles.map}>
        <Map ref={set_local_map} {...map_props} mapboxAccessToken={api_key}>
          <Marker
            anchor="bottom"
            longitude={coords?.longitude ?? lng}
            latitude={coords?.latitude ?? lat}
          />
        </Map>
      </div>

      <div className={styles.map}>
        <Map ref={set_remote_map} {...map_props} mapboxAccessToken={api_key}>
          <Marker longitude={lng} latitude={lat} anchor="bottom" />
        </Map>
      </div> */}
    </div>
  );
}
