import Foundation

public enum Fixtures {
    // Synthetic geometry only. Not a reconstruction result or scan-quality test.
    public static func twoRooms() -> SpatialDocument {
        let points: [(Double,Double)] = [(0,0),(4,0),(8,0),(8,4),(4,4),(0,4)]
        let nodes = points.enumerated().map { Node(id:"n\($0.offset)",point:Point2(x:$0.element.0,z:$0.element.1)) }
        let links = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4]]
        let walls = links.enumerated().map { Wall(id:"w\($0.offset)",nodeIDs:$0.element.map { "n\($0)" },height:2.6,heightBasis:.synthetic,provenance:.init(origin:.synthetic)) }
        let openings = [
            Opening(id:"door-a",wallID:"w6",kind:.door,offset:1,width:0.9,bottom:0,height:2.05,provenance:.init(origin:.synthetic)),
            Opening(id:"window-a",wallID:"w4",kind:.window,offset:1,width:1.4,bottom:0.9,height:1.1,provenance:.init(origin:.synthetic)),
            Opening(id:"entry",wallID:"w1",kind:.passage,offset:1.5,width:0.9,bottom:0,height:2.05,provenance:.init(origin:.synthetic))
        ]
        let rooms = [
            Room(id:"room-a",label:"Assessment area",boundary:[.init(wallID:"w0"),.init(wallID:"w6"),.init(wallID:"w4"),.init(wallID:"w5")]),
            Room(id:"room-b",label:"Office",boundary:[.init(wallID:"w1"),.init(wallID:"w2"),.init(wallID:"w3"),.init(wallID:"w6",reversed:true)])
        ]
        return SpatialDocument(documentID:"synthetic-two-rooms",title:"Synthetic two-room test",
            floors:[Floor(id:"floor-1",label:"Level 1",nodes:nodes,walls:walls,openings:openings,rooms:rooms)])
    }
}
