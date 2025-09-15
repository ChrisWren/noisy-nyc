"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { getEmojiForComplaint } from "@/lib/utils";

interface ServiceRequest {
  unique_key: string;
  created_date: string;
  complaint_type: string;
  descriptor: string;
  agency_name: string;
  status: string;
  latitude?: number;
  longitude?: number;
}

interface ComplaintMapProps {
  requests: ServiceRequest[];
}

const ComplaintMap: React.FC<ComplaintMapProps> = ({ requests }) => {
  const nycCenter: [number, number] = [40.7128, -74.006];

  return (
    <MapContainer
      center={nycCenter}
      zoom={11}
      style={{ height: "500px", width: "100%" }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {requests.map((request) => {
        if (request.latitude && request.longitude) {
          const emoji = getEmojiForComplaint(request.complaint_type);
          const icon = L.divIcon({
            html: `<span style="font-size: 24px;">${emoji}</span>`,
            className: "", // remove default background
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          });

          return (
            <Marker
              key={request.unique_key}
              position={[request.latitude, request.longitude]}
              icon={icon}
            >
              <Popup>
                <b>{request.complaint_type}</b>
                <br />
                {request.descriptor}
                <br />
                <i>{new Date(request.created_date).toLocaleString()}</i>
              </Popup>
            </Marker>
          );
        }
        return null;
      })}
    </MapContainer>
  );
};

export default ComplaintMap;
