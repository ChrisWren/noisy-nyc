import json
import math
from typing import List, Tuple, Optional
from dataclasses import dataclass
from collections import deque
import heapq

@dataclass
class IntersectionNode:
    id: str
    lat: float
    lng: float
    street_names: List[str]
    connections: List[str]
    intersection_type: str = "regular"

class ManhattanIntersectionGraph:
    """Graph for pathfinding and analysis of Manhattan intersections"""
    
    def __init__(self, json_file: str):
        self.intersections = {}
        self.load_from_json(json_file)
    
    def load_from_json(self, json_file: str):
        """Load intersection data from JSON file"""
        try:
            with open(json_file, 'r') as f:
                data = json.load(f)
            
            for int_id, int_data in data['intersections'].items():
                node = IntersectionNode(
                    id=int_data['id'],
                    lat=int_data['lat'],
                    lng=int_data['lng'],
                    street_names=int_data['street_names'],
                    connections=int_data['connections'],
                    intersection_type=int_data.get('intersection_type', 'regular')
                )
                self.intersections[int_id] = node
            
            print(f"Loaded {len(self.intersections)} intersections")
            
        except Exception as e:
            print(f"Error loading JSON: {e}")
    
    def haversine_distance(self, lat1: float, lng1: float, lat2: float, lng2: float) -> float:
        """Calculate distance between two points in meters"""
        R = 6371000  # Earth's radius in meters
        
        lat1_rad, lng1_rad = math.radians(lat1), math.radians(lng1)
        lat2_rad, lng2_rad = math.radians(lat2), math.radians(lng2)
        
        dlat = lat2_rad - lat1_rad
        dlng = lng2_rad - lng1_rad
        
        a = (math.sin(dlat/2)**2 + 
             math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlng/2)**2)
        c = 2 * math.asin(math.sqrt(a))
        
        return R * c
    
    def find_nearest_intersection(self, lat: float, lng: float) -> Optional[IntersectionNode]:
        """Find the closest intersection to given coordinates"""
        if not self.intersections:
            return None
        
        min_distance = float('inf')
        nearest = None
        
        for intersection in self.intersections.values():
            distance = self.haversine_distance(lat, lng, intersection.lat, intersection.lng)
            if distance < min_distance:
                min_distance = distance
                nearest = intersection
        
        return nearest
    
    def get_neighbors(self, intersection_id: str) -> List[IntersectionNode]:
        """Get all neighboring intersections"""
        if intersection_id not in self.intersections:
            return []
        
        neighbors = []
        for neighbor_id in self.intersections[intersection_id].connections:
            if neighbor_id in self.intersections:
                neighbors.append(self.intersections[neighbor_id])
        
        return neighbors
    
    def shortest_path(self, start_id: str, end_id: str) -> Tuple[List[str], float]:
        """Find shortest path between two intersections using Dijkstra's algorithm"""
        if start_id not in self.intersections or end_id not in self.intersections:
            return [], float('inf')
        
        # Dijkstra's algorithm
        distances = {node_id: float('inf') for node_id in self.intersections}
        previous = {}
        distances[start_id] = 0
        unvisited = [(0, start_id)]
        visited = set()
        
        while unvisited:
            current_distance, current_id = heapq.heappop(unvisited)
            
            if current_id in visited:
                continue
            
            visited.add(current_id)
            
            if current_id == end_id:
                break
            
            current_node = self.intersections[current_id]
            
            for neighbor_id in current_node.connections:
                if neighbor_id in visited or neighbor_id not in self.intersections:
                    continue
                
                neighbor_node = self.intersections[neighbor_id]
                distance = self.haversine_distance(
                    current_node.lat, current_node.lng,
                    neighbor_node.lat, neighbor_node.lng
                )
                
                new_distance = current_distance + distance
                
                if new_distance < distances[neighbor_id]:
                    distances[neighbor_id] = new_distance
                    previous[neighbor_id] = current_id
                    heapq.heappush(unvisited, (new_distance, neighbor_id))
        
        # Reconstruct path
        if end_id not in previous and start_id != end_id:
            return [], float('inf')
        
        path = []
        current = end_id
        while current is not None:
            path.append(current)
            current = previous.get(current)
        
        path.reverse()
        return path, distances[end_id]
    
    def find_intersections_by_street(self, street_name: str) -> List[IntersectionNode]:
        """Find all intersections on a given street"""
        results = []
        street_name_lower = street_name.lower()
        
        for intersection in self.intersections.values():
            for name in intersection.street_names:
                if street_name_lower in name.lower():
                    results.append(intersection)
                    break
        
        return results
    
    def get_intersection_info(self, intersection_id: str) -> dict:
        """Get detailed information about an intersection"""
        if intersection_id not in self.intersections:
            return {}
        
        intersection = self.intersections[intersection_id]
        neighbors = self.get_neighbors(intersection_id)
        
        return {
            "id": intersection.id,
            "coordinates": (intersection.lat, intersection.lng),
            "streets": intersection.street_names,
            "type": intersection.intersection_type,
            "neighbor_count": len(neighbors),
            "neighbors": [
                {
                    "id": n.id,
                    "streets": n.street_names,
                    "distance_meters": self.haversine_distance(
                        intersection.lat, intersection.lng, n.lat, n.lng
                    )
                }
                for n in neighbors
            ]
        }
    
    def export_for_web_app(self, output_file: str = "manhattan_graph_web.json"):
        """Export in a format optimized for web applications"""
        if not self.intersections:
            print("No intersections to export.")
            return None

        web_data = {
            "nodes": [],
            "edges": [],
            "metadata": {
                "total_nodes": len(self.intersections),
                "coordinate_system": "WGS84",
                "bounds": {
                    "north": max(n.lat for n in self.intersections.values()),
                    "south": min(n.lat for n in self.intersections.values()),
                    "east": max(n.lng for n in self.intersections.values()),
                    "west": min(n.lng for n in self.intersections.values())
                }
            }
        }
        
        # Export nodes
        for intersection in self.intersections.values():
            web_data["nodes"].append({
                "id": intersection.id,
                "lat": intersection.lat,
                "lng": intersection.lng,
                "streets": intersection.street_names,
                "type": intersection.intersection_type
            })
        
        # Export edges with distances
        edge_set = set()
        for intersection in self.intersections.values():
            for neighbor_id in intersection.connections:
                if neighbor_id in self.intersections:
                    # Create sorted edge to avoid duplicates
                    edge = tuple(sorted([intersection.id, neighbor_id]))
                    if edge not in edge_set:
                        edge_set.add(edge)
                        
                        neighbor = self.intersections[neighbor_id]
                        distance = self.haversine_distance(
                            intersection.lat, intersection.lng,
                            neighbor.lat, neighbor.lng
                        )
                        
                        web_data["edges"].append({
                            "from": edge[0],
                            "to": edge[1],
                            "distance": round(distance, 1)
                        })
        
        web_data["metadata"]["total_edges"] = len(web_data["edges"])
        
        with open(output_file, 'w') as f:
            json.dump(web_data, f, indent=2)
        
        print(f"Web-optimized data exported to {output_file}")
        return output_file

def demo_usage():
    """Demonstrate how to use the Manhattan intersection graph"""
    print("=== Manhattan Intersection Graph Demo ===\n")
    
    # Load the graph (you'll need to run the extractor first)
    try:
        graph = ManhattanIntersectionGraph("manhattan_intersections.json")
    except FileNotFoundError:
        print("Run the OSM extractor first to generate manhattan_intersections.json")
        return
    
    # 1. Find intersections on Broadway
    print("1. Finding intersections on Broadway:")
    broadway_intersections = graph.find_intersections_by_street("Broadway")
    print(f"Found {len(broadway_intersections)} Broadway intersections")
    for intersection in broadway_intersections[:5]:  # Show first 5
        streets = " & ".join(intersection.street_names[:3])
        print(f"   - {streets} ({intersection.lat:.4f}, {intersection.lng:.4f})")
    
    # 2. Find nearest intersection to a location (Times Square area)
    print("\n2. Finding nearest intersection to Times Square (40.7580, -73.9855):")
    nearest = graph.find_nearest_intersection(40.7580, -73.9855)
    if nearest:
        distance = graph.haversine_distance(40.7580, -73.9855, nearest.lat, nearest.lng)
        streets = " & ".join(nearest.street_names)
        print(f"   Nearest: {streets}")
        print(f"   Distance: {distance:.1f} meters")
    
    # 3. Get detailed info about an intersection
    if nearest:
        print(f"\n3. Detailed info for intersection {nearest.id}:")
        info = graph.get_intersection_info(nearest.id)
        print(f"   Streets: {', '.join(info['streets'])}")
        print(f"   Type: {info['type']}")
        print(f"   Neighbors: {info['neighbor_count']}")
        for neighbor in info['neighbors'][:3]:  # Show first 3 neighbors
            print(f"     - {' & '.join(neighbor['streets'][:2])} "
                  f"({neighbor['distance_meters']:.0f}m away)")
    
    # 4. Find shortest path between two intersections
    print("\n4. Finding shortest path between intersections:")
    intersections_list = list(graph.intersections.keys())
    if len(intersections_list) >= 2:
        start = intersections_list[0]
        end = intersections_list[10] if len(intersections_list) > 10 else intersections_list[-1]
        
        path, distance = graph.shortest_path(start, end)
        if path:
            start_streets = " & ".join(graph.intersections[start].street_names[:2])
            end_streets = " & ".join(graph.intersections[end].street_names[:2])
            print(f"   From: {start_streets}")
            print(f"   To: {end_streets}")
            print(f"   Path length: {len(path)} intersections")
            print(f"   Total distance: {distance:.0f} meters")
    
    # 5. Export for web app
    print("\n5. Exporting web-optimized format:")
    web_file = graph.export_for_web_app()
    print(f"   Ready for use in web applications!")

if __name__ == "__main__":
    demo_usage()