/**
 * HNSW Vector Index implementation for efficient similarity search
 */
export class HNSWVectorIndex {
    constructor(dimension = 1024, options = {}) {
        this.dimension = dimension;
        this.M = options.M || 16;  // Max number of connections per node
        this.efConstruction = options.efConstruction || 200;  // Size of dynamic candidate list
        this.ef = options.ef || 50;  // Size of dynamic candidate list for searches
        this.mL = options.mL || 1 / Math.log(this.M);  // Level generation factor
        
        this.initializeEmptyIndex();
    }

    initializeEmptyIndex() {
        this.layers = [new Map()];  // Multi-layer graph structure
        this.maxLayer = 0;
        this.entryPoint = null;
        this.vectors = new Map();
        this.metadata = new Map();
    }

    getStats() {
        return {
            dimension: this.dimension,
            totalVectors: this.vectors.size,
            layerCount: this.layers.length,
            maxLayer: this.maxLayer,
            hasEntryPoint: !!this.entryPoint,
            configuration: {
                M: this.M,
                efConstruction: this.efConstruction,
                ef: this.ef,
                mL: this.mL
            },
            layerStats: this.layers.map((layer, index) => ({
                level: index,
                nodeCount: layer.size,
                totalConnections: Array.from(layer.values())
                    .reduce((sum, connections) => sum + connections.size, 0)
            })),
            memoryUsage: {
                vectors: this.vectors.size * this.dimension * 8, // Approximate bytes for float64
                metadata: this.metadata.size,
                connections: this.layers.reduce((sum, layer) => 
                    sum + Array.from(layer.values())
                        .reduce((layerSum, connections) => layerSum + connections.size, 0), 
                    0
                )
            }
        };
    }

    generateLevel() {
        return Math.floor(-Math.log(Math.random()) * this.mL);
    }

    distance(vec1, vec2) {
        let sum = 0;
        for (let i = 0; i < this.dimension; i++) {
            const diff = vec1[i] - vec2[i];
            sum += diff * diff;
        }
        return Math.sqrt(sum);
    }

    async add(id, vector, metadata = {}) {
        // 1. Validate vector dimension
        if (vector.length !== this.dimension) {
            throw new Error(
                `Invalid vector dimension. Expected ${this.dimension}, got ${vector.length}`
            );
        }
    
        // 2. Store vector + metadata
        this.vectors.set(id, vector);
        this.metadata.set(id, metadata);
    
        // 3. Generate a random level for this node
        const level = this.generateLevel();
    
        // 4. Ensure layers array has enough levels
        while (this.layers.length <= level) {
            this.layers.push(new Map());
        }
    
        // 5. If this is the very first entry, just initialize and return
        if (this.entryPoint === null) {
            this.entryPoint = { id, level };
            for (let l = 0; l <= level; l++) {
                // Each layer gets this ID with an empty set of connections
                this.layers[l].set(id, new Set());
            }
            return;
        }
    
        // 6. Otherwise, we link this node in each layer up to "level"
        let currentNode = this.entryPoint;
    
        // Only search down to the min of this node's level and the current maxLayer
        for (let l = Math.min(level, this.maxLayer); l >= 0; l--) {
            // Find nearest neighbors at this layer
            const neighbors = await this.searchLayer(vector, currentNode, l, this.efConstruction);
    
            // We'll connect to the top M closest neighbors
            const connections = new Set();
            for (let i = 0; i < Math.min(this.M, neighbors.length); i++) {
                const neighborId = neighbors[i].id;
    
                // --- IMPORTANT FIX: Ensure neighbor has a Set in this layer ---
                if (!this.layers[l].has(neighborId)) {
                    this.layers[l].set(neighborId, new Set());
                }
                this.layers[l].get(neighborId).add(id);
    
                connections.add(neighborId);
            }
    
            // Add our own connections set for this new ID
            this.layers[l].set(id, connections);
    
            // Move "currentNode" to the best neighbor for the next iteration
            if (neighbors[0]) {
                currentNode = { id: neighbors[0].id, level: l };
            }
        }
    
        // 7. If this node's level is above the current max, update entry point
        if (level > this.maxLayer) {
            this.maxLayer = level;
            this.entryPoint = { id, level };
        }
    }
    


    async searchLayer(queryVector, entryNode, layer, ef) {
        // Safety check for empty or invalid index
        if (!entryNode || !this.layers[layer] || !this.vectors.get(entryNode.id)) {
            return [];
        }

        const visited = new Set([entryNode.id]);
        const candidates = new Map();
        
        const entryDist = this.distance(queryVector, this.vectors.get(entryNode.id));
        candidates.set(entryNode.id, entryDist);
        
        const results = new Map([[entryNode.id, entryDist]]);
        
        while (candidates.size > 0) {
            const [currentId, currentDist] = Array.from(candidates.entries())
                .reduce((a, b) => a[1] < b[1] ? a : b);
            
            const furthestResult = Array.from(results.entries())
                .reduce((a, b) => a[1] > b[1] ? a : b);
            
            if (currentDist > furthestResult[1]) break;
            
            candidates.delete(currentId);
            
            // Safety check for missing neighbors
            const neighbors = this.layers[layer].get(currentId) || new Set();
            
            for (const neighborId of neighbors) {
                // Safety check for missing vector
                if (!visited.has(neighborId) && this.vectors.has(neighborId)) {
                    visited.add(neighborId);
                    
                    const distance = this.distance(queryVector, this.vectors.get(neighborId));
                    
                    if (results.size < ef || distance < furthestResult[1]) {
                        candidates.set(neighborId, distance);
                        results.set(neighborId, distance);
                        
                        if (results.size > ef) {
                            const [worstId] = Array.from(results.entries())
                                .reduce((a, b) => a[1] > b[1] ? a : b);
                            results.delete(worstId);
                        }
                    }
                }
            }
        }
        
        return Array.from(results.entries())
            .map(([id, dist]) => ({ id, distance: dist }))
            .sort((a, b) => a.distance - b.distance);
    }

    

    async search(queryVector, options = {}) {
        const { topK = 10, ef = this.ef } = options;
        
        if (this.entryPoint === null) return [];

        let currentNode = this.entryPoint;
        
        for (let l = this.maxLayer; l > 0; l--) {
            const neighbors = await this.searchLayer(queryVector, currentNode, l, 1);
            currentNode = { id: neighbors[0].id, level: l };
        }
        
        const results = await this.searchLayer(queryVector, currentNode, 0, ef);
        
        return results.slice(0, topK).map(result => ({
            id: result.id,
            distance: result.distance,
            metadata: this.metadata.get(result.id)
        }));
    }

    async save() {
        return {
            dimension: this.dimension,
            maxLayer: this.maxLayer,
            entryPoint: this.entryPoint,
            vectors: Array.from(this.vectors.entries()),
            metadata: Array.from(this.metadata.entries()),
            layers: this.layers.map(layer => Array.from(layer.entries())
                .map(([id, connections]) => [id, Array.from(connections)]))
        };
    }

    async load(state) {
        try {
            // Validate state before loading
            if (!state || !state.dimension || !Array.isArray(state.layers)) {
                console.warn('Invalid state provided to load, initializing empty index');
                this.initializeEmptyIndex();
                return;
            }

            this.dimension = state.dimension;
            this.maxLayer = state.maxLayer || 0;
            this.entryPoint = (state.entryPoint && state.entryPoint.id && Number.isInteger(state.entryPoint.level)) 
            ? state.entryPoint 
            : null;
                        
            // Safely convert vectors and metadata
            this.vectors = new Map(Array.isArray(state.vectors) ? state.vectors : []);
            this.metadata = new Map(Array.isArray(state.metadata) ? state.metadata : []);

            // Safely convert layers
            this.layers = state.layers.map(layer => {
                if (!Array.isArray(layer)) return new Map();
                return new Map(
                    layer.map(([id, connections]) => [
                        id, 
                        new Set(Array.isArray(connections) ? connections : [])
                    ])
                );
            });

            // Ensure at least one layer exists
            if (this.layers.length === 0) {
                this.layers = [new Map()];
            }
        } catch (error) {
            console.error('Error loading index state:', error);
            this.initializeEmptyIndex();
        }
    }
}
