/*
 * 3D hit-testable-with-rays objects
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

(function() {
  var snippets = tess.snippets;

  var traceableGlobalId = 1;

  tess.Plane = function Plane( normal, d, isDynamic, material ) {
    this.id = traceableGlobalId++;
    this.prefix = 'plane' + this.id;
    this.isDynamic = isDynamic;

    this.normal = normal;
    this.d = d;

    this.normalName = this.prefix + 'normal';
    this.dName = this.prefix + 'd';

    this.material = material;

    this.uniforms = isDynamic ? [this.normalName, this.dName] : [];
  };
  tess.Plane.prototype = {
    constructor: tess.Plane,

    requiredSnippets: [snippets.rayIntersectPlane3],

    update: function( program ) {
      if ( this.isDynamic ) {
        program.gl.uniform3f( program.uniformLocations[this.normalName], this.normal.x, this.normal.y, this.normal.z );
        program.gl.uniform1f( program.uniformLocations[this.dName], this.d );
      }
    },

    getPreamble: function() {
      if ( this.isDynamic ) {
        return 'uniform vec3 ' + this.normalName + ';\n' +
               'uniform float ' + this.dName + ';\n';
      } else {
        return 'const vec3 ' + this.normalName + ' = ' + tess.toVec3( this.normal ) + ';\n' +
               'const float ' + this.dName + ' = ' + tess.toFloat( this.d ) + ';\n';
      }
    },

    getIntersectionExpressionType: function() {
      return 'float';
    },

    getIntersectionExpression: function( rayPosName, rayDirName ) {
      return 'rayIntersectPlane3( ' + this.normalName + ', ' + this.dName + ', ' + rayPosName + ', ' + rayDirName + ' );';
    },

    getValidIntersectionCheck: function( hitName ) {
      return '(' + hitName + ' > ' + tess.smallEpsilon + ')';
    },

    getT: function( hitName ) {
      return hitName;
    },

    getNormal: function( hitName, hitPositionName, rayPosName, rayDirName ) {
      return this.normalName;
    },

    hitTest: function( ray ) {
      var t = ( this.d - this.normal.dot( ray.pos ) ) / this.normal.dot( ray.dir );
      return t > 0.00001 ? t : Number.POSITIVE_INFINITY;
    }
  };

  tess.Box3 = function Box3( minPoint, maxPoint, isDynamic, material, isTwoSided ) {
    this.id = traceableGlobalId++;
    this.prefix = 'box' + this.id;
    this.isDynamic = isDynamic;
    this.isTwoSided = isTwoSided;

    this.min = minPoint;
    this.max = maxPoint;

    this.minName = this.prefix + 'min';
    this.maxName = this.prefix + 'max';
    this.centerName = this.prefix + 'center';
    this.halfSizeName = this.prefix + 'halfSize';

    this.material = material;

    this.uniforms = isDynamic ? [this.minName, this.maxName] : [];
  };
  tess.Box3.prototype = {
    constructor: tess.Box3,

    requiredSnippets: [snippets.rayIntersectAABB3,snippets.normalFastOnAABB3],

    update: function( program ) {
      if ( this.isDynamic ) {
        program.gl.uniform3f( program.uniformLocations[this.minName], this.min.x, this.min.y, this.min.z );
        program.gl.uniform3f( program.uniformLocations[this.maxName], this.max.x, this.max.y, this.max.z );
      }
    },

    getPreamble: function() {
      if ( this.isDynamic ) {
        return 'uniform vec3 ' + this.minName + ';\n' +
               'uniform vec3 ' + this.maxName + ';\n' +
               'vec3 ' + this.centerName + ' = ( ' + this.maxName + ' + ' + this.minName + ' ) / 2.0;\n' +
               'vec3 ' + this.halfSizeName + ' = ( ' + this.maxName + ' - ' + this.minName + ' ) / 2.0;\n';
      } else {
        return '';
      }
    },

    getIntersectionExpressionType: function() {
      return 'vec2';
    },

    getIntersectionExpression: function( rayPosName, rayDirName ) {
      var min = this.isDynamic ? this.minName : tess.toVec3( this.min );
      var max = this.isDynamic ? this.maxName : tess.toVec3( this.max );
      return 'rayIntersectAABB3( ' + min + ', ' + max + ', ' + rayPosName + ', ' + rayDirName + ' );';
    },

    getValidIntersectionCheck: function( hitName ) {
      if ( this.isTwoSided ) {
        // we only care if the more "distant" hit is t>0 if we do the two-sided check
        return '(' + hitName + '.y > ' + tess.smallEpsilon + ' && ' + hitName + '.x < ' + hitName + '.y)';
      } else {
        return '(' + hitName + '.x > ' + tess.smallEpsilon + ' && ' + hitName + '.x < ' + hitName + '.y)';
      }
    },

    getT: function( hitName ) {
      if ( this.isTwoSided ) {
        // pick the "front" point that has t>0
        return '(' + hitName + '.x > ' + tess.smallEpsilon + ' ? ' + hitName + '.x : ' + hitName + '.y)';
      } else {
        return hitName + '.x';
      }
    },

    getInsideExpression: function( hitName ) {
      if ( this.isTwoSided ) {
        return '(' + hitName + '.x < 0.0)';
      } else {
        return 'false';
      }
    },

    getNormal: function( hitName, hitPositionName, rayPosName, rayDirName ) {
      var center = this.isDynamic ? this.centerName : tess.toVec3( this.max.plus( this.min ).times( 0.5 ) );
      var halfSize = this.isDynamic ? this.halfSizeName : tess.toVec3( this.max.minus( this.min ).times( 0.5 ) );

      if ( this.isTwoSided ) {
        // if our "front" hit t<0, negate the normal
        return '( sign( ' + hitName + '.x ) * normalFastOnAABB3( ' + center + ', ' + halfSize + ', ' + hitPositionName + ' ) )';
      } else {
        return 'normalFastOnAABB3( ' + center + ', ' + halfSize + ', ' + hitPositionName + ' )';
      }
    },

    hitTest: function( ray ) {
      // t values for the negative plane sides
      var tBack = dot( ( this.min.x - ray.pos.x ) / ray.dir.x,
                       ( this.min.y - ray.pos.y ) / ray.dir.y,
                       ( this.min.z - ray.pos.z ) / ray.dir.z );
      var tFront = dot( ( this.max.x - ray.pos.x ) / ray.dir.x,
                        ( this.max.y - ray.pos.y ) / ray.dir.y,
                        ( this.max.z - ray.pos.z ) / ray.dir.z );

      // sort t values based on closeness
      var tMin = dot( Math.min( tBack.x, tFront.x ), Math.min( tBack.y, tFront.y ), Math.min( tBack.z, tFront.z ) );
      var tMax = dot( Math.max( tBack.x, tFront.x ), Math.max( tBack.y, tFront.y ), Math.max( tBack.z, tFront.z ) );

      // farthest "near" is when the ray as passed all three planes
      var tNear = Math.max( Math.max( tMin.x, tMin.y ), tMin.z );

      // closest "far" is when the ray will exit
      var tFar = Math.min( Math.min( tMax.x, tMax.y ), tMax.z );

      // if tNear >= tFar, there is no intersection  (tNear,tFar)
      if ( tNear >= tFar || tNear < 0.00001 ) {
        return Number.POSITIVE_INFINITY;
      } else {
        return tNear;
      }
    }
  };

  tess.Sphere = function Sphere( center, radius, isDynamic, material, isTwoSided ) {
    this.id = traceableGlobalId++;
    this.prefix = 'sphere' + this.id;
    this.isDynamic = isDynamic;
    this.isTwoSided = isTwoSided;

    this.center = center;
    this.radius = radius;

    this.radiusName = this.prefix + 'radius';
    this.centerName = this.prefix + 'center';

    this.material = material;

    this.refresh();
  };
  tess.Sphere.prototype = {
    constructor: tess.Sphere,

    requiredSnippets: [snippets.rayIntersectSphere,snippets.normalOnSphere],

    update: function( program ) {
      if ( this.isDynamic ) {
        program.gl.uniform3f( program.uniformLocations[this.centerName], this.center.x, this.center.y, this.center.z );
        program.gl.uniform1f( program.uniformLocations[this.radiusName], this.radius );
      }
    },

    refresh: function() {
      if ( this.isDynamic ) {
        this.radiusValue = this.radiusName;
        this.centerValue = this.centerName;
      } else {
        this.centerValue = tess.toVec3( this.center );
        this.radiusValue = tess.toFloat( this.radius );
      }

      if ( this.material instanceof tess.SoccerMaterial ) {
        this.centerValue = '( ' + this.centerValue + ' + vec3( -( times.x + ( times.y - times.x ) * ( pseudorandom(seed*14.53+1.6) ) ), 0.0, 0.0 ) )';
      }

      this.uniforms = this.isDynamic ? [this.radiusName, this.centerName] : [];
    },

    getPreamble: function() {
      if ( this.isDynamic ) {
        return 'uniform vec3 ' + this.centerName + ';\n' +
               'uniform float ' + this.radiusName + ';\n';
      } else {
        return '';
      }
    },

    getIntersectionExpressionType: function() {
      return 'vec2';
    },

    getIntersectionExpression: function( rayPosName, rayDirName ) {
      // return 'rayIntersectSphere( ' + this.centerValue + ( this.material instanceof tess.SoccerMaterial ? ' + vec3( pseudorandom(seed*14.53+1.6) * 0.0, 0.0, 0.0 )' : '' ) + ', ' + this.radiusValue + ', ' + rayPosName + ', ' + rayDirName + ' );';
      return 'rayIntersectSphere( ' + this.centerValue + ', ' + this.radiusValue + ', ' + rayPosName + ', ' + rayDirName + ' );';
      // return 'rayIntersectSphere( ' + this.centerValue + ( this.material instanceof tess.SoccerMaterial ? ' + vec3( ( times.x + ( times.y - times.x ) * ( pseudorandom(seed*14.53+1.6) ) ), 0.0, 0.0 )' : '' ) + ', ' + this.radiusValue + ', ' + rayPosName + ', ' + rayDirName + ' );';
    },

    getValidIntersectionCheck: function( hitName ) {
      if ( this.isTwoSided ) {
        // we only care if the more "distant" hit is t>0 if we do the two-sided check
        return '(' + hitName + '.y > ' + tess.smallEpsilon + ' && ' + hitName + '.x < ' + hitName + '.y)';
      } else {
        return '(' + hitName + '.x > ' + tess.smallEpsilon + ' && ' + hitName + '.x < ' + hitName + '.y)';
      }
    },

    getT: function( hitName ) {
      if ( this.isTwoSided ) {
        // pick the "front" point that has t>0
        return '(' + hitName + '.x > ' + tess.smallEpsilon + ' ? ' + hitName + '.x : ' + hitName + '.y)';
      } else {
        return hitName + '.x';
      }
    },

    getInsideExpression: function( hitName ) {
      if ( this.isTwoSided ) {
        return '(' + hitName + '.x < 0.0)';
      } else {
        return 'false';
      }
    },

    getNormal: function( hitName, hitPositionName, rayPosName, rayDirName ) {
      if ( this.isTwoSided ) {
        // if our "front" hit t<0, negate the normal
        return '( sign( ' + hitName + '.x ) * normalOnSphere( ' + this.centerValue + ', ' + this.radiusValue + ', ' + hitPositionName + ' ) )';
      } else {
        return 'normalOnSphere( ' + this.centerValue + ', ' + this.radiusValue + ', ' + hitPositionName + ' )';
      }
    },

    hitTest: function( ray ) {
      var toSphere = ray.pos.minus( this.center );
      var a = ray.dir.dot( ray.dir );
      var b = 2 * toSphere.dot( ray.dir );
      var c = toSphere.dot( toSphere ) - this.radius * this.radius;
      var discriminant = b * b - 4 * a * c;
      if ( discriminant > 0.00001 ) {
        var sqt = Math.sqrt( discriminant );
        var ta = ( -sqt - b ) / ( 2 * a );
        if ( ta > 0.00001 ) {
          return ta;
        }
        var tb = ( sqt - b ) / ( 2 * a );
        if ( tb > 0.00001 ) {
          return tb;
        }
      }
      return Number.POSITIVE_INFINITY;
    }
  };

  var scale = '50.0';
  var distanceFunc = new tess.Snippet(
    'float distanceFunc( vec3 p ) { p.y = p.y - 43.0; float angle = atan( p.z, p.x ); float mag = length( vec2( p.x, p.z ) ); angle = mod( angle, 2.0 * PI / 9.0 ) - PI / 9.0; vec3 pMod = vec3( mag * cos( angle ), p.y, mag * sin( angle ) ); pMod = pMod - vec3( -0.10 + 3.6101617647058823, 8.41375, 0.0 ); pMod.xy = mat2( 0.9975179222617693, 0.07041302980671309, -0.07041302980671309, 0.9975179222617693 ) * pMod.xy; pMod = pMod - vec3( 2.6323478497786517, 0.0, 0.0 ); return dDifference(dDifference(dUnion(dDifference(dIntersection(dUnion(dIntersection(sdCone( p - vec3( 0.0, -47.22812500000002, 0.0 ), vec2(0.9975179222617702,-0.07041302980671316) ),dIntersection(sdPlane( p, vec3( 0, -1, 0 ), 0.3175 ),sdPlane( p, vec3( 0, 1, 0 ), -13.49375 ) )),dUnion(sdTorus( p - vec3( 0.0, 0.3175, 0.0 ), vec2( 3.0386617647058825, 0.3175 ) ), sdCylinder( p, vec3( 0.0, 0.0, 3.0386617647058825 ) ))),sdPlane( p, vec3( 0, -1, 0 ), 0.0 )),dUnion(dUnion(dIntersection(sdCone( p - vec3( 0.0, -42.73020833333336, 0.0 ), vec2(0.9975179222617702,-0.07041302980671316) ),sdPlane( p, vec3( 0, -1, 0 ), 10.00125 )),sdTorus( p - vec3( 0.0, 10.00125, 0.0 ), vec2( 2.4522205882352943, 1.27 ) ) ),dIntersection(dUnion(dIntersection(sdCone( p - vec3( 0.0, -38.23229166666669, 0.0 ), vec2(0.9975179222617702,-0.07041302980671316) ),sdPlane( p, vec3( 0, -1, 0 ), 1.42875 )),dUnion(sdTorus( p - vec3( 0.0, 1.42875, 0.0 ), vec2( 2.4821029411764712, 0.3175 ) ), sdCylinder( p, vec3( 0.0, 0.0, 2.4821029411764712 ) ))),sdPlane( p, vec3( 0, -1, 0 ), 1.11125 )))),sdTorus( p - vec3( 0.0, 13.49375, 0.0 ), vec2( 4.1274999999999995, 0.15875 ) )),dUnion(sdTorus( p, vec2( 2.38125, 0.079375 ) ),dIntersection(sdCylinder( p, vec3( 0.0, 0.0, 2.38125 ) ),sdPlane( p, vec3( 0, 1, 0 ), -0.079375 )) )),dUnion(dIntersection(sdCylinder( pMod, vec3( 0.0, 0.0, 2.6323478497786517) ), sdPlane( pMod, vec3( 0, 1, 0 ), 0.0 )),sdSphere( pMod, 2.6323478497786517 ) ));}\n',
    [snippets.PI, snippets.sdSphere, snippets.sdPlane, snippets.sdCylinder, snippets.sdTorus, snippets.sdCone, snippets.dIntersection, snippets.dDifference, snippets.dUnion]
  );

  var testIntersection = new tess.Snippet(
    'vec2 testIntersection( vec3 rayPos, vec3 rayDir ) {\n' +
    '  float t = 0.0;\n' +
    '  float dt = 0.0;\n' +
    '  for( int tests = 0; tests < ' + 65 + '; tests++ ) {\n' +
    '    vec3 p = rayT( rayPos, rayDir, t );\n' +
    '    float dist = abs( distanceFunc( p ) );\n' +
    '    dt = dist * 1.0;\n' +
    '    t = t + dt;\n' +
    '  }\n' +
    '  return vec2( dt > 0.1 ? -1.0 : t, distanceFunc( rayT( rayPos, rayDir, t - 0.001 ) ) );\n' +
    '}\n',
    [distanceFunc, tess.snippets.rayT]
  );

  var testNormal = new tess.Snippet(
    'vec3 testNormal( vec3 rayPos, vec3 rayDir, vec3 hitPos ) {\n' +
    '  vec3 testPoint = hitPos - rayDir * 0.001;\n' +
    '  return normalize( vec3( ' +
        'distanceFunc( testPoint + vec3( 0.0001, 0.0, 0.0 ) ) - distanceFunc( testPoint - vec3( 0.0001, 0.0, 0.0 ) ),' +
        'distanceFunc( testPoint + vec3( 0.0, 0.0001, 0.0 ) ) - distanceFunc( testPoint - vec3( 0.0, 0.0001, 0.0 ) ),' +
        'distanceFunc( testPoint + vec3( 0.0, 0.0, 0.0001 ) ) - distanceFunc( testPoint - vec3( 0.0, 0.0, 0.0001 ) )' +
    ' ) );\n' +
    '}\n',
    [distanceFunc]
  );

  tess.TestObject = function TestObject( material ) {
    this.id = traceableGlobalId++;
    this.prefix = 'testy' + this.id;

    this.material = material;

    this.uniforms = [];
  };
  tess.TestObject.prototype = {
    constructor: tess.TestObject,

    requiredSnippets: [testIntersection, testNormal],

    update: function( program ) {

    },

    getPreamble: function() {
      return '';
    },

    getIntersectionExpressionType: function() {
      return 'vec2';
    },

    getIntersectionExpression: function( rayPosName, rayDirName ) {
      return 'testIntersection( ' + rayPosName + ', ' + rayDirName + ' );';
    },

    getValidIntersectionCheck: function( hitName ) {
      return '(' + hitName + '.x > ' + tess.smallEpsilon + ' )';
    },

    getT: function( hitName ) {
      return hitName + '.x';
    },

    getInsideExpression: function( hitName ) {
      return '(' + hitName + '.y < 0.0 )';
    },

    getNormal: function( hitName, hitPositionName, rayPosName, rayDirName ) {
      return 'testNormal( ' + rayPosName + ',' + rayDirName + ',' + hitPositionName + ' );\n';
    },

    hitTest: function( ray ) {
      return Number.POSITIVE_INFINITY; // TODO: actual hit testing here also
    }
  };
})();
