"""
Snapshot storage API - move snapshots from localStorage to database
Handles saving/loading/listing board state snapshots
"""
from flask import Blueprint, request, jsonify
import json
import sqlite3
import os
from datetime import datetime, timezone

bp = Blueprint('snapshots', __name__, url_prefix='/snapshots')

# Database setup
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'snapshots.db')

def init_db():
    """Initialize snapshots database with proper schema"""
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS snapshots (
                name TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                created_at TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                version INTEGER DEFAULT 3
            )
        ''')
        conn.commit()

@bp.route('/save', methods=['POST'])
def save_snapshot():
    """Save a snapshot to database"""
    try:
        data = request.get_json()
        name = data.get('name', '').strip()
        snapshot_data = data.get('data', {})
        
        if not name:
            return jsonify({'ok': False, 'error': 'Snapshot name required'}), 400
            
        if not snapshot_data:
            return jsonify({'ok': False, 'error': 'Snapshot data required'}), 400
            
        # Serialize and check size
        json_str = json.dumps(snapshot_data)
        size_bytes = len(json_str.encode('utf-8'))
        
        # 50MB limit for database storage (much more generous than localStorage)
        if size_bytes > 50 * 1024 * 1024:
            return jsonify({
                'ok': False, 
                'error': f'Snapshot too large ({size_bytes // (1024*1024)}MB). Maximum 50MB allowed.'
            }), 413
            
        created_at = datetime.now(timezone.utc).isoformat()
        
        init_db()
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute('''
                INSERT OR REPLACE INTO snapshots (name, data, created_at, size_bytes, version)
                VALUES (?, ?, ?, ?, ?)
            ''', (name, json_str, created_at, size_bytes, 3))
            conn.commit()
            
        return jsonify({
            'ok': True,
            'name': name,
            'size_kb': size_bytes // 1024,
            'created_at': created_at
        })
        
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@bp.route('/load/<name>', methods=['GET'])
def load_snapshot(name):
    """Load a snapshot from database"""
    try:
        if not name.strip():
            return jsonify({'ok': False, 'error': 'Snapshot name required'}), 400
            
        init_db()
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.execute('''
                SELECT data, created_at, size_bytes 
                FROM snapshots 
                WHERE name = ?
            ''', (name,))
            row = cursor.fetchone()
            
        if not row:
            return jsonify({'ok': False, 'error': 'Snapshot not found'}), 404
            
        data_str, created_at, size_bytes = row
        snapshot_data = json.loads(data_str)
        
        return jsonify({
            'ok': True,
            'name': name,
            'data': snapshot_data,
            'created_at': created_at,
            'size_kb': size_bytes // 1024
        })
        
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@bp.route('/list', methods=['GET'])
def list_snapshots():
    """List all available snapshots"""
    try:
        init_db()
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.execute('''
                SELECT name, created_at, size_bytes, version
                FROM snapshots 
                ORDER BY created_at DESC
            ''')
            rows = cursor.fetchall()
            
        snapshots = []
        for name, created_at, size_bytes, version in rows:
            snapshots.append({
                'name': name,
                'created_at': created_at,
                'size_kb': size_bytes // 1024,
                'version': version or 3
            })
            
        return jsonify({
            'ok': True,
            'snapshots': snapshots,
            'count': len(snapshots)
        })
        
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@bp.route('/delete/<name>', methods=['DELETE'])
def delete_snapshot(name):
    """Delete a snapshot from database"""
    try:
        if not name.strip():
            return jsonify({'ok': False, 'error': 'Snapshot name required'}), 400
            
        init_db()
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.execute('SELECT 1 FROM snapshots WHERE name = ?', (name,))
            if not cursor.fetchone():
                return jsonify({'ok': False, 'error': 'Snapshot not found'}), 404
                
            conn.execute('DELETE FROM snapshots WHERE name = ?', (name,))
            conn.commit()
            
        return jsonify({'ok': True, 'name': name})
        
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@bp.route('/cleanup', methods=['POST'])
def cleanup_snapshots():
    """Clean up old snapshots, keeping only the most recent N"""
    try:
        data = request.get_json() or {}
        keep_count = data.get('keep', 10)  # Keep 10 most recent by default
        
        init_db()
        with sqlite3.connect(DB_PATH) as conn:
            # Get snapshots to delete (all except the most recent keep_count)
            cursor = conn.execute('''
                SELECT name FROM snapshots 
                ORDER BY created_at DESC 
                LIMIT -1 OFFSET ?
            ''', (keep_count,))
            to_delete = [row[0] for row in cursor.fetchall()]
            
            deleted_count = 0
            for name in to_delete:
                conn.execute('DELETE FROM snapshots WHERE name = ?', (name,))
                deleted_count += 1
                
            conn.commit()
            
        return jsonify({
            'ok': True,
            'deleted_count': deleted_count,
            'kept_count': keep_count
        })
        
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500
