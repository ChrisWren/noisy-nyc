"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Container,
  Table,
  Spinner,
  Alert,
  InputGroup,
  FormControl,
  Row,
  Col,
} from "react-bootstrap";

// Dynamically import the map component to avoid SSR issues
const ComplaintMap = dynamic(() => import("@/components/ComplaintMap"), {
  ssr: false,
  loading: () => (
    <div className="text-center">
      <Spinner animation="border" role="status">
        <span className="visually-hidden">Loading Map...</span>
      </Spinner>
    </div>
  ),
});

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

export default function Home() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const response = await fetch(
          "https://data.cityofnewyork.us/resource/fhrw-4uyv.json?$limit=1000&$order=created_date DESC"
        );
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        // Socrata returns numbers as strings, so we need to parse them
        const parsedData = data.map((req: any) => ({
          ...req,
          latitude: req.latitude ? parseFloat(req.latitude) : undefined,
          longitude: req.longitude ? parseFloat(req.longitude) : undefined,
        }));
        setRequests(parsedData);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();
  }, []);

  const filteredRequests = useMemo(() => {
    if (!searchTerm) {
      return requests;
    }
    return requests.filter((request) =>
      Object.values(request).some((value) =>
        String(value).toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [requests, searchTerm]);

  return (
    <Container fluid>
      <Row className="my-4">
        <Col>
          <h1 className="display-4">NYC 311 Service Requests</h1>
          <p className="lead">
            Displaying the 1,000 most recent service requests from the NYC
            OpenData API.
          </p>
        </Col>
      </Row>

      <Row className="mb-4">
        <Col>
          <ComplaintMap requests={filteredRequests} />
        </Col>
      </Row>

      <Row className="mb-3">
        <Col>
          <InputGroup>
            <FormControl
              placeholder="Search across all fields..."
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </InputGroup>
        </Col>
      </Row>

      <Row>
        <Col>
          {loading && (
            <div className="text-center">
              <Spinner animation="border" role="status">
                <span className="visually-hidden">Loading...</span>
              </Spinner>
            </div>
          )}
          {error && <Alert variant="danger">Error: {error}</Alert>}
          {!loading && !error && (
            <Table striped bordered hover responsive>
              <thead>
                <tr>
                  <th>Created Date</th>
                  <th>Complaint Type</th>
                  <th>Descriptor</th>
                  <th>Agency</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request) => (
                  <tr key={request.unique_key}>
                    <td>{new Date(request.created_date).toLocaleString()}</td>
                    <td>{request.complaint_type}</td>
                    <td>{request.descriptor}</td>
                    <td>{request.agency_name}</td>
                    <td>{request.status}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Col>
      </Row>
    </Container>
  );
}
