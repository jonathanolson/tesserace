/*
 * Snippets are bits of code with dependencies, for GLSL shader purposes. 2D/3D/4D code.
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

(function(){
  var globalSnippetIdCounter = 0;

  // Represents a piece of GLSL shader code that can have dependencies on other shader snippets.
  // Supports easy serialization of all required functions for a shader, excluding any unneeded snippets.
  // Dependencies are optional, can just specify Snippet( '...' )
  //   var a = new tess.Snippet( 'A' )
  //   var b = new tess.Snippet( 'B', [a] )
  //   var c = new tess.Snippet( 'C', [a] )
  //   var d = new tess.Snippet( 'D', [b,c] )
  //   d.toString() => "ABCD"
  //   b.toString() => "AB"
  //   c.toString() => "AC"
  tess.Snippet = function Snippet( source, dependencies ) {
    this.id = globalSnippetIdCounter++;
    this.source = source;
    this.dependencies = dependencies;
  };

  tess.Snippet.prototype = {
    constructor: tess.Snippet,

    // Assuming no circular dependencies, this returns the entire required subprogram as a string.
    // usedSnippets is used for internal use, just call toString()
    toString: function( usedSnippets ) {
      if ( !usedSnippets ) {
        usedSnippets = {};
      }

      var result = '';

      // if we have already been included, all of our dependencies have been included
      if ( usedSnippets[this.id] ) {
        return result;
      }

      if ( this.dependencies ) {
        for ( var i = 0; i < this.dependencies.length; i++ ) {
          result += this.dependencies[i].toString( usedSnippets );
        }
      }

      result += this.source;

      usedSnippets[this.id] = true;

      return result;
    }
  };

  var snippets = tess.snippets = {};

  var constantLength = 33;

  snippets.PI = new tess.Snippet(
    '#define PI ' + '3.1415926535897932384626433832795028841971693993751058'.substring( 0, constantLength ) + '\n' );
  snippets.TWO_PI = new tess.Snippet(
    '#define TWO_PI ' + '6.2831853071795864769252867665590057683943387987502116'.substring( 0, constantLength ) + '\n' );
  snippets.HALF_PI = new tess.Snippet(
    '#define HALF_PI ' + '1.5707963267948966192313216916397514420985846996875529'.substring( 0, constantLength ) + '\n' );
  snippets.PHI = new tess.Snippet(
    '#define PHI ' + '1.618033988749894848204586834365638117720309179805763'.substring( 0, constantLength ) + '\n' );
  snippets.INV_PHI = new tess.Snippet(
    '#define INV_PHI ' + '0.6180339887498948482045868343656381177203091798057629'.substring( 0, constantLength ) + '\n' );
  snippets.SQRT_2 = new tess.Snippet(
    '#define SQRT_2 ' + '1.414213562373095048801688724209698078569671875376948'.substring( 0, constantLength ) + '\n' );
  snippets.SQRT_5 = new tess.Snippet(
    '#define SQRT_5 ' + '2.236067977499789696409173668731276235440618359611526'.substring( 0, constantLength ) + '\n' );
  snippets.INV_2_SQRT_2 = new tess.Snippet( // e.g. 1 / ( 2 * Sqrt[2] )
    '#define INV_2_SQRT_2 ' + '0.3535533905932737622004221810524245196424179688442370'.substring( 0, constantLength ) + '\n' );

  snippets.rand = new tess.Snippet(
    'highp float rand(vec2 co) {\n' +
    '    highp float a = 12.9898;\n' +
    '    highp float b = 78.233;\n' +
    '    highp float c = 43758.5453;\n' +
    '    highp float dt= dot(co.xy ,vec2(a,b));\n' +
    '    highp float sn= mod(dt,3.1415926);\n' +
    '    return fract(sin(sn) * c);\n' +
    '}\n' );

  snippets.pseudorandom = new tess.Snippet(
    'float pseudorandom(float u) {\n' +
      '  float a = fract(sin(gl_FragCoord.x*12.9898*3758.5453));\n' +
      '  float b = fract(sin(gl_FragCoord.x*63.7264*3758.5453));\n' +
      '  return rand(gl_FragCoord.xy * mod(u * 4.5453,3.1415926));\n' +
    '}\n', [snippets.rand] );

  snippets.rayT = new tess.Snippet(
    'vec3 rayT( vec3 rayPos, vec3 rayDir, float t ) {\n' +
    '  return rayPos + t * rayDir;\n' +
    '}\n' );

  // for a plane determined by "normal . p = d" for points "p", returns ray t to intersection
  snippets.rayIntersectPlane3 = new tess.Snippet(
    'float rayIntersectPlane3( vec3 normal, float d, vec3 rayPos, vec3 rayDir ) {\n' +
    '  return ( d - dot( normal, rayPos ) ) / dot( normal, rayDir );\n' +
    '}\n' );

  // for a plane determined by "normal . p = d" for points "p", returns ray t to intersection
  snippets.rayIntersectPlane4 = new tess.Snippet(
    'float rayIntersectPlane4( vec4 normal, float d, vec4 rayPos, vec4 rayDir ) {\n' +
    '  return ( d - dot( normal, rayPos ) ) / dot( normal, rayDir );\n' +
    '}\n' );

  // returns (tNear,tFar). intersection based on the slab method. no intersection if tN
  snippets.rayIntersectAABB3 = new tess.Snippet(
    'vec2 rayIntersectAABB3( vec3 boxMinCorner, vec3 boxMaxCorner, vec3 rayPos, vec3 rayDir ) {\n' +
    // t values for the negative plane sides
    '  vec3 tBack = ( boxMinCorner - rayPos ) / rayDir;\n' +
    '  vec3 tFront = ( boxMaxCorner - rayPos ) / rayDir;\n' +

    // sort t values based on closeness
    '  vec3 tMin = min( tBack, tFront );\n' +
    '  vec3 tMax = max( tBack, tFront );\n' +

    // farthest "near" is when the ray as passed all three planes
    '  float tNear = max( max( tMin.x, tMin.y ), tMin.z );\n' +

    // closest "far" is when the ray will exit
    '  float tFar = min( min( tMax.x, tMax.y ), tMax.z );\n' +

    // if tNear >= tFar, there is no intersection
    '  return vec2( tNear, tFar );\n' +
    '}\n' );

  // returns vec2( tNear, tFar). intersection based on the slab method.
  // Only assume an intersection if tNear < tFear
  snippets.rayIntersectAABB4 = new tess.Snippet(
    'float rayIntersectAABB4( vec4 boxMinCorner, vec4 boxMaxCorner, vec4 rayPos, vec4 rayDir ) {\n' +
    // t values for the negative plane sides
    '  vec4 tBack = ( boxMinCorner - rayPos ) / rayDir;\n' +
    '  vec4 tFront = ( boxMaxCorner - rayPos ) / rayDir;\n' +

    // sort t values based on closeness
    '  vec4 tMin = min( tBack, tFront );\n' +
    '  vec4 tMax = max( tBack, tFront );\n' +

    // farthest "near" is when the ray as passed all three planes
    '  float tNear = max( max( max( tMin.x, tMin.y ), tMin.z ), tMin.w );\n' +

    // closest "far" is when the ray will exit
    '  float tFar = min( min( min( tMax.x, tMax.y ), tMax.z ), tMax.w );\n' +

    // if tNear >= tFar, there is no intersection
    '  return vec2( tNear, tFar );\n' +
    '}\n' );

  // boxCenter = (maxCorner + minCorner)/2, boxHalfSize = (maxCorner - minCorner)/2
  snippets.normalOnAABB3 = new tess.Snippet(
    'vec3 normalOnAABB3( vec3 boxCenter, vec3 boxHalfSize, vec3 point ) {\n' +
    '  vec3 delta = ( point - boxCenter ) / boxHalfSize;\n' +
    '  vec3 ab = abs( delta );\n' +
    '  if ( ab.x > ab.y ) {\n' +
    '    if ( ab.x > ab.z ) {\n' +
    '      return vec3( sign( delta.x ), 0, 0 );\n' +
    '    }\n' +
    '  } else {\n' +
    '    if ( ab.y > ab.z ) {\n' +
    '      return vec3( 0, sign( delta.y ), 0 );\n' +
    '    }\n' +
    '  }\n' +
    '  return vec3( 0, 0, sign( delta.z ) );\n' +
    '}\n' );

  // boxCenter = (maxCorner + minCorner)/2, boxHalfSize = (maxCorner - minCorner)/2
  // NOTE: for intersections very close to corners and edges, we may return a normal blended between the faces
  snippets.normalFastOnAABB3 = new tess.Snippet(
    'vec3 normalFastOnAABB3( vec3 boxCenter, vec3 boxHalfSize, vec3 point ) {\n' +
    '  vec3 unitDelta = ( point - boxCenter ) / boxHalfSize;\n' +
    '  return normalize( step( 1.0 - ' + tess.epsilon + ', unitDelta ) - step( 1.0 - ' + tess.epsilon + ', -1.0 * unitDelta ) );\n' +
    '}\n' );

  // boxCenter = (maxCorner + minCorner)/2, boxHalfSize = (maxCorner - minCorner)/2
  snippets.normalOnAABB4 = new tess.Snippet(
    'vec3 normalOnAABB4( vec4 boxCenter, vec4 boxHalfSize, vec4 point ) {\n' +
    '  vec4 delta = ( point - boxCenter ) / boxHalfSize;\n' +
    '  vec4 ab = abs( delta );\n' +
    '  if ( ab.x > ab.y ) {\n' +
    '    if ( ab.x > ab.z ) {\n' +
    '      if ( ab.x > ab.w ) {\n' +
    '        return vec4( sign( delta.x ), 0, 0, 0 );\n' +
    '      }\n' +
    '    } else {\n' +
    '      if ( ab.z > ab.w ) {\n' +
    '        return vec4( 0, 0, sign( delta.z ), 0 );\n' +
    '      }\n' +
    '    }\n' +
    '  } else {\n' +
    '    if ( ab.y > ab.z ) {\n' +
    '      if ( ab.y > ab.w ) {\n' +
    '        return vec4( 0, sign( delta.y ), 0, 0 );\n' +
    '      }\n' +
    '    } else {\n' +
    '      if ( ab.z > ab.w ) {\n' +
    '        return vec4( 0, 0, sign( delta.z ), 0 );\n' +
    '      }\n' +
    '    }\n' +
    '  }\n' +
    '  return vec4( 0, 0, 0, sign( delta.w ) );\n' +
    '}\n' );

  // boxCenter = (maxCorner + minCorner)/2, boxHalfSize = (maxCorner - minCorner)/2
  // NOTE: for intersections very close to corners and edges, we may return a normal blended between the faces
  snippets.normalFastOnAABB4 = new tess.Snippet(
    'vec4 normalFastOnAABB4( vec4 boxCenter, vec4 boxHalfSize, vec4 point ) {\n' +
    '  vec4 unitDelta = ( point - boxCenter ) / boxHalfSize;\n' +
    '  return normalize( step( 1.0 - ' + tess.epsilon + ', unitDelta ) - step( 1.0 - ' + tess.epsilon + ', -1.0 * unitDelta ) );\n' +
    '}\n' );

  // returns vec2( tNear, tFar ), only assume intersection if tNear < tFar
  snippets.rayIntersectSphere = new tess.Snippet(
    'vec2 rayIntersectSphere( vec3 center, float radius, vec3 rayPos, vec3 rayDir ) {\n' +
    '  vec3 toSphere = rayPos - center;\n' +
    '  float a = dot( rayDir, rayDir );\n' +
    '  float b = 2.0 * dot( toSphere, rayDir );\n' +
    '  float c = dot( toSphere, toSphere ) - radius * radius;\n' +
    '  float discriminant = b * b - 4.0 * a * c;\n' +
    '  if( discriminant > ' + tess.smallEpsilon + ' ) {\n' +
    '    float sqt = sqrt( discriminant );\n' +
    '    return ( vec2( -sqt, sqt ) - b ) / ( 2.0 * a );\n' +
    '  } else {\n' +
    '    return vec2( 1.0, -1.0 );\n' +
    '  }\n' +
    '}\n' );

  // returns vec2( tNear, tFar ), only assume intersection if tNear < tFar
  snippets.rayIntersect3Sphere = new tess.Snippet(
    'vec2 rayIntersect3Sphere( vec4 center, float radius, vec4 rayPos, vec4 rayDir ) {\n' +
    '  vec4 toSphere = rayPos - center;\n' +
    '  float a = dot( rayDir, rayDir );\n' +
    '  float b = 2.0 * dot( toSphere, rayDir );\n' +
    '  float c = dot( toSphere, toSphere ) - radius * radius;\n' +
    '  float discriminant = b * b - 4.0 * a * c;\n' +
    '  if( discriminant > ' + tess.smallEpsilon + ' ) {\n' +
    '    float sqt = sqrt( discriminant );\n' +
    '    return ( vec2( -sqt, sqt ) - b ) / ( 2.0 * a );\n' +
    '  } else {\n' +
    '    return vec2( 1.0, -1.0 );\n' +
    '  }\n' +
    '}\n' );

  snippets.boxMuller = new tess.Snippet(
    'vec2 boxMuller( float xi1, float xi2 ) {\n' +
    '  float angle = TWO_PI * xi2;\n' +
    '  return vec2( cos( angle ), sin( angle ) ) * sqrt( -2 * log( xi1 ) );\n' +
    '}\n', [snippets.TWO_PI] );

  snippets.normalOnSphere = new tess.Snippet(
    'vec3 normalOnSphere( vec3 center, float radius, vec3 point ) {\n' +
    '  return ( point - center ) / radius;\n' +
    '}\n' );

  snippets.normalOn3Sphere = new tess.Snippet(
    'vec4 normalOnSphere( vec4 center, float radius, vec4 point ) {\n' +
    '  return ( point - center ) / radius;\n' +
    '}\n' );

  snippets.uniformInsideDisk = new tess.Snippet(
    'vec2 uniformInsideDisk( float xi1, float xi2 ) {\n' +
    '  float angle = TWO_PI * xi1;\n' +
    '  float mag = sqrt( xi2 );\n' +
    '  return vec2( mag * cos( angle ), mag * sin( angle ) );\n' +
    '}\n', [snippets.TWO_PI] );

  snippets.sampleUniformOnSphere = new tess.Snippet(
    'vec3 sampleUniformOnSphere( float xi1, float xi2 ) {\n' +
    '  float angle = TWO_PI * xi1;\n' +
    '  float mag = 2.0 * sqrt( xi2 * ( 1.0 - xi2 ) );\n' +
    // NOTE: don't change order without checking sampleUniformOnHemisphere, order of uniform xi is required to stay the same
    '  return vec3( mag * cos( angle ), mag * sin( angle ), 1.0 - 2.0 * xi2 );\n' +
    '}\n', [snippets.TWO_PI] );

  // z >= 0
  snippets.sampleUniformOnHemisphere = new tess.Snippet(
    'vec3 sampleUniformOnHemisphere( float xi1, float xi2 ) {\n' +
    '  return sampleUniformOnSphere( xi1, xi2 / 2 );\n' +
    '}\n', [snippets.sampleUniformOnSphere] );

  // dot-weighted by (0,0,1)
  snippets.sampleDotWeightOnHemiphere = new tess.Snippet(
    'vec3 sampleDotWeightOnHemiphere( float xi1, float xi2 ) {\n' +
    '  float angle = TWO_PI * xi1;\n' +
    '  float mag = sqrt( xi2 );\n' +
    '  return vec3( mag * cos( angle ), mag * sin( angle ), sqrt( 1.0 - xi2 ) );\n' +
    '}\n', [snippets.TWO_PI] );

  // (dot)^n-weighted by (0,0,1)
  snippets.samplePowerDotWeightOnHemiphere = new tess.Snippet(
    'vec3 samplePowerDotWeightOnHemiphere( float n, float xi1, float xi2 ) {\n' +
    '  float angle = TWO_PI * xi1;\n' +
    '  float z = pow( abs( xi2 ), 1.0 / ( n + 1.0 ) );\n' +
    '  float mag = sqrt( 1.0 - z * z );\n' +
    '  return vec3( mag * cos( angle ), mag * sin( angle ), z );\n' +
    '}\n', [snippets.TWO_PI] );

  snippets.sampleUniformOn3Sphere = new tess.Snippet(
    'vec4 sampleUniformOn3Sphere( float xi1, float xi2, float xi3, float xi4 ) {\n' +
    '  return normalize( vec4( boxMuller( xi1, xi2 ).xy, boxMuller( xi3, xi4 ).xy ) );\n' +
    '}\n', [snippets.boxMuller] );

  // w >= 0
  snippets.sampleUniformOn3Hemisphere = new tess.Snippet(
    'vec4 sampleUniformOn3Hemisphere( float xi1, float xi2, float xi3, float xi4 ) {\n' +
    '  vec2 boxy = boxMuller( xi3, xi4 );\n' +
    '  return normalize( vec4( boxMuller( xi1, xi2 ).xy, boxy.x, abs( boxy.y ) ) );\n' +
    '}\n', [snippets.boxMuller] );

  // dot-weighted by (0,0,0,1)
  snippets.sampleDotWeightOn3Hemiphere = new tess.Snippet(
    'vec4 sampleDotWeightOnHemiphere( float xi1, float xi2, float xi3 ) {\n' +
    '  float tr = pow( abs( xi1 ), 1.0/3.0 );\n' +
    '  float mag = tr * sqrt( xi2 * ( 1 - xi2 ) );\n' +
    '  float angle = TWO_PI * xi3;\n' +
    '  return vec4( mag * cos( angle ), mag * sin( angle ), tr * ( 1 - 2 * xi2 ), sqrt( 1 - tr * tr ) );\n' +
    '}\n', [snippets.TWO_PI] );

  snippets.constructBasis3 = new tess.Snippet(
    'mat3 constructBasis3( vec3 normal ) {\n' +
    '  vec3 a, b;\n' +
    '  if ( abs( normal.x ) < 0.5 ) {\n' +
    '    a = normalize( cross( normal, vec3( 1, 0, 0 ) ) );\n' +
    '  } else {\n' +
    '    a = normalize( cross( normal, vec3( 0, 1, 0 ) ) );\n' +
    '  }\n' +
    '  b = normalize( cross( normal, a ) );\n' +
    '  return mat3( a, b, normal );\n' +
    '}\n' );

  snippets.sampleBasis3 = new tess.Snippet(
    'vec3 sampleBasis3( mat3 basis, vec3 sampleDir ) {\n' +
    '  return basis[0] * sampleDir.x + basis[1] * sampleDir.y + basis[2] * sampleDir.z;\n' +
    '}\n' );

  snippets.sampleTowardsNormal3 = new tess.Snippet(
    'vec3 sampleTowardsNormal3( vec3 normal, vec3 sampleDir ) {\n' +
    '  vec3 a, b;\n' +
    '  if ( abs( normal.x ) < 0.5 ) {\n' +
    '    a = normalize( cross( normal, vec3( 1, 0, 0 ) ) );\n' +
    '  } else {\n' +
    '    a = normalize( cross( normal, vec3( 0, 1, 0 ) ) );\n' +
    '  }\n' +
    '  b = normalize( cross( normal, a ) );\n' +
    '  return a * sampleDir.x + b * sampleDir.y + normal * sampleDir.z;\n' +
    '}\n' );

  snippets.constructBasis4 = new tess.Snippet(
    // assumes n.y and n.w are not zero
    'mat4 constructBasis4Ordered( vec4 n ){\n' +
    '  float n14 = n.x / n.w;\n' +
    '  float n32 = n.z / n.y;\n' +
    '  vec4 x = vec4( 1, 0, 0, -n14 ) * inversesqrt( n14 * n14 + 1.0 );\n' +
    '  vec4 y = vec4( 0, -n32, 1, 0 ) * inversesqrt( n32 * n32 + 1.0 );\n' +
    '  vec4 z = vec4( n.y * x.w / y.z, n.w * y.z / x.x, -n.w * y.y / x.x, -n.y * x.x / y.z );\n' +
    '  return mat4( x, y, z, n );\n' +
    '}\n' +

    'mat4 constructBasis4( vec4 normal ) {\n' +
    '  bvec4 sig = greaterThan( abs( normal ), vec4( ' + tess.smallEpsilon + ' ) );\n' +
    '  mat4 basis;\n' +
    '  if ( sig.x ) {\n' +
    '    if ( sig.y ) {\n' +
    '      basis = constructBasis4Ordered( normal.wyzx );\n' +
    '      return mat4( basis[0].wyzx, basis[1].wyzx, basis[2].wyzx, basis[3].wyzx );\n' +
    '    } else if ( sig.z ) {\n' +
    '      basis = constructBasis4Ordered( normal.yxwz );\n' +
    '      return mat4( basis[0].yxwz, basis[1].yxwz, basis[2].yxwz, basis[3].yxwz );\n' +
    '    } else if ( sig.w ) {\n' +
    '      basis = constructBasis4Ordered( normal.yxzw );\n' +
    '      return mat4( basis[0].yxzw, basis[1].yxzw, basis[2].yxzw, basis[3].yxzw );\n' +
    '    } else {\n' +
    '      return mat4( vec4(0,1,0,0), vec4(0,0,1,0), vec4(0,0,0,1), normal );\n' +
    '    }\n' +
    '  } else if ( sig.y ) {\n' +
    '    if ( sig.z ) {\n' +
    '      basis = constructBasis4Ordered( normal.xywz );\n' +
    '      return mat4( basis[0].xywz, basis[1].xywz, basis[2].xywz, basis[3].xywz );\n' +
    '    } else if ( sig.w ) {\n' +
    '      basis = constructBasis4Ordered( normal.xyzw );\n' +
    '      return mat4( basis[0].xyzw, basis[1].xyzw, basis[2].xyzw, basis[3].xyzw );\n' +
    '    } else {\n' +
    '      return mat4( vec4(1,0,0,0), vec4(0,0,1,0), vec4(0,0,0,1), normal );\n' +
    '    }\n' +
    '  } else if ( sig.z ) {\n' +
    '    if ( sig.w ) {\n' +
    '      basis = constructBasis4Ordered( normal.xzyw );\n' +
    '      return mat4( basis[0].xzyw, basis[1].xzyw, basis[2].xzyw, basis[3].xzyw );\n' +
    '    } else {\n' +
    '      return mat4( vec4(1,0,0,0), vec4(0,1,0,0), vec4(0,0,0,1), normal );\n' +
    '    }\n' +
    '  } else if ( sig.w ) {\n' +
    '    return mat4( vec4(1,0,0,0), vec4(0,1,0,0), vec4(0,0,1,0), normal );\n' +
    '  } else {\n' +
    // no significant vectors? should be impossible, but just bail with default case
    '    return constructBasis4Ordered( normal );\n' +
    '  }\n' +
    '}\n' );

  snippets.sampleBasis4 = new tess.Snippet(
    'vec4 sampleBasis4( mat3 basis, vec4 sampleDir ) {\n' +
    '  return basis[0] * sampleDir.x + basis[1] * sampleDir.y + basis[2] * sampleDir.z + basis[3] * sampleDir.w;\n' +
    '}\n', [snippets.constructBasis4] );

  // if abs(dot(normal,incident)) < TIRcutoff, it's total internal reflection
  snippets.totalInternalReflectionCutoff = new tess.Snippet(
    'float totalInternalReflectionCutoff( float na, float nb ) {\n' +
    '  if ( na <= nb ) {\n' +
    '    return 0.0;\n' +
    '  }\n' +
    '  float ratio = nb / na;\n' +
    '  return sqrt( 1.0 - ratio * ratio );\n' +
    '}\n' );

  // reflectance (1-transmission) for dielectrics, requires precomputed transmitted unit vector. Going from IOR na => nb. returns vec2( sReflect, pReflect )
  snippets.fresnelDielectric = new tess.Snippet(
    'vec2 fresnelDielectric( vec3 incident, vec3 normal, vec3 transmitted, float na, float nb ) {\n' +
    '  float doti = abs( dot( incident, normal ) );\n' +
    '  float dott = abs( dot( transmitted, normal ) );\n' +
    // TODO: could be optimized?
    '  vec2 result = vec2( ( na * doti - nb * dott ) / ( na * doti + nb * dott ), ( na * dott - nb * doti ) / ( na * dott + nb * doti ) );\n' +
    '  return result * result;\n' +
    '}\n' );

  // reflectance (1-transmission) for general (metallic?) surfaces. Going from IOR na => nb. returns vec2( sReflect, pReflect ). k is the extinction coefficient?
  snippets.fresnel = new tess.Snippet(
    'vec2 fresnel( vec3 incident, vec3 normal, float na, float nb, float k ) {\n' +
    '  float doti = abs( dot( incident, normal ) );\n' +
    '  float comm = na * na * ( doti * doti - 1.0 ) / ( ( nb * nb + k * k ) * ( nb * nb + k * k ) );\n' +
    '  float resq = 1.0 + comm * ( nb * nb - k * k );\n' +
    '  float imsq = 2.0 * comm * nb * k;\n' +
    '  float temdott = sqrt( resq * resq + imsq * imsq );\n' +
    '  float redott = ( sqrt( 2.0 ) / 2.0 ) * sqrt( temdott + resq );\n' +
    '  float imdott = ( imsq >= 0.0 ? 1.0 : -1.0 ) * ( sqrt( 2.0 ) / 2.0 ) * sqrt( temdott - resq );\n' +
    '  float renpdott = nb * redott + k * imdott;\n' +
    '  float imnpdott = nb * imdott - k * redott;\n' +
    '  float retop = na * doti - renpdott;\n' +
    '  float rebot = na * doti + renpdott;\n' +
    '  float retdet = rebot * rebot + imnpdott * imnpdott;\n' +
    '  float reret = ( retop * rebot + -imnpdott * imnpdott ) / retdet;\n' +
    '  float imret = ( -imnpdott * rebot - retop * imnpdott ) / retdet;\n' +
    '  float sReflect = reret * reret + imret * imret;\n' +
    '  retop = ( nb * nb - k * k ) * doti - na * renpdott;\n' +
    '  rebot = ( nb * nb - k * k ) * doti + na * renpdott;\n' +
    '  float imtop = -2.0 * nb * k * doti - na * imnpdott;\n' +
    '  float imbot = -2.0 * nb * k * doti + na * imnpdott;\n' +
    '  retdet = rebot * rebot + imbot * imbot;\n' +
    '  reret = ( retop * rebot + imtop * imbot ) / retdet;\n' +
    '  imret = ( imtop * rebot - retop * imbot ) / retdet;\n' +
    '  float pReflect = reret * reret + imret * imret;\n' +
    '  return vec2( sReflect, pReflect );\n' +
    '}\n' );

  // NOTE: assumes we have already checked for TIR, so abs( dot( incident, normal ) ) >= totalInternalReflectionCutoff( na, nb )
  snippets.sampleFresnelDielectric = new tess.Snippet(
    'vec3 sampleFresnelDielectric( vec3 incident, vec3 normal, float na, float nb, float xi1 ) {\n' +
    '  vec3 transmitDir = refract( incident, normal, na / nb );\n' +
    '  vec2 reflectance = fresnelDielectric( incident, normal, transmitDir, na, nb );\n' +
    '  if ( xi1 > ( reflectance.x + reflectance.y ) / 2.0 ) {\n' +
    // refract
    '    return transmitDir;\n' +
    '  } else {\n' +
    // reflect
    '    return reflect( incident, normal );\n' +
    '  }\n' +
    '}\n', [snippets.fresnelDielectric] );

  // sellmeier dispersion (wavelength in nm => IOR)
  snippets.sellmeierDispersion = new tess.Snippet(
    'float sellmeierDispersion( float bx, float by, float bz, float cx, float cy, float cz, float wavelength ) {\n' +
    '  float lams = wavelength * wavelength / 1000000.0;\n' +
    '  return sqrt( 1.0 + ( bx * lams ) / ( lams - cx ) + ( by * lams ) / ( lams - cy ) + ( bz * lams ) / ( lams - cz ) );\n' +
    '}\n' );
  // BK7: 1.03961212, 0.231792344, 1.01046945, 0.00600069867, 0.0200179144, 103.560653
  // fused silica: 0.6961663, 0.4079426, 0.8974794, 0.00467914826, 0.0135120631, 97.9340025
  // fluorite: 0.5675888, 0.4710914, 3.8484723, 0.00252642999, 0.0100783328, 1200.55597

  snippets.closestIcosahedronPoint = new tess.Snippet(
    'vec3 closestIcosahedronPoint( vec3 n ) {\n' +
    '  vec3 v1 = vec3( 0.0, n.y > 0.0 ? 1.0 : -1.0, n.z > 0.0 ? PHI : -PHI );\n' +
    '  vec3 v2 = vec3( n.x > 0.0 ? 1.0 : -1.0, n.y > 0.0 ? PHI : -PHI, 0.0 );\n' +
    '  vec3 v3 = vec3( n.x > 0.0 ? PHI : -PHI, 0.0, n.z > 0.0 ? 1.0 : -1.0 );\n' +
    '  float d1 = dot( n, v1 );\n' +
    '  float d2 = dot( n, v2 );\n' +
    '  float d3 = dot( n, v3 );\n' +
    '  return d1 > d2 ? ( d1 > d3 ? v1 : v3 ) : ( d2 > d3 ? v2 : v3 );\n' +
    '}\n', [snippets.PHI] );

  snippets.closestDodecahedronPoint = new tess.Snippet(
    'vec3 closestDodecahedronPoint( vec3 n ) {\n' +
    '  vec3 v1 = vec3( 0.0, n.y > 0.0 ? PHI : -PHI, n.z > 0.0 ? INV_PHI : -INV_PHI );\n' +
    '  vec3 v2 = vec3( n.x > 0.0 ? PHI : -PHI, n.y > 0.0 ? INV_PHI : -INV_PHI, 0.0 );\n' +
    '  vec3 v3 = vec3( n.x > 0.0 ? INV_PHI : -INV_PHI, 0.0, n.z > 0.0 ? PHI : -PHI );\n' +
    '  vec3 v4 = vec3( n.x > 0.0 ? 1.0 : -1.0, n.y > 0.0 ? 1.0 : -1.0, n.z > 0.0 ? 1.0 : -1.0 );\n' +
    '  float d1 = dot( n, v1 );\n' +
    '  float d2 = dot( n, v2 );\n' +
    '  float d3 = dot( n, v3 );\n' +
    '  float d4 = dot( n, v4 );\n' +
    '  return d1 > d2 ? ( d1 > d3 ? ( d1 > d4 ? v1 : v4 ) : ( d3 > d4 ? v3 : v4 ) ) : ( d2 > d3 ? ( d2 > d4 ? v2 : v4 ) : ( d3 > d4 ? v3 : v4 ) );\n' +
    '}\n', [snippets.PHI, snippets.INV_PHI] );

  /*---------------------------------------------------------------------------*
  * Distance field helpers
  * see http://www.iquilezles.org/www/articles/distfunctions/distfunctions.htm
  * some are tweaked
  *----------------------------------------------------------------------------*/

  snippets.sdSphere = new tess.Snippet(
    'float sdSphere( vec3 p, float s ) {\n' +
    '  return length( p ) - s;\n' +
    '}\n' );

  snippets.udBox = new tess.Snippet(
    'float udBox( vec3 p, float b ) {\n' +
    '  return length( max( abs( p ) - b, 0.0 ) );\n' +
    '}\n' );

  snippets.sdBox = new tess.Snippet(
    'float sdBox( vec3 p, float b ) {\n' +
    '  vec3 d = abs(p) - b;\n' +
    '  return min( max( d.x, max( d.y, d.z ) ), 0.0 ) + length( max( d, 0.0 ) );\n' +
    '}\n' );

  snippets.udRoundBox = new tess.Snippet(
    'float udRoundBox( vec3 p, float b, float r ) {\n' +
    '  return length( max( abs( p ) -b, 0.0 ) ) - r;\n' +
    '}\n' );

  snippets.sdTorus = new tess.Snippet(
    'float sdTorus( vec3 p, vec2 t ) {\n' +
    '  vec2 q = vec2( length( p.xz ) - t.x, p.y );\n' +
    '  return length( q ) - t.y;\n' +
    '}\n' );

  snippets.sdCylinder = new tess.Snippet(
    'float sdCylinder( vec3 p, vec3 c ) {\n' +
    '  return length( p.xz - c.xy ) - c.z;\n' +
    '}\n' );

  // Cone along the y direction. c must be normalized (normal to the cone in the 2D xz,y space)
  snippets.sdCone = new tess.Snippet(
    'float sdCone( vec3 p, vec2 c ) {\n' +
    '  float q = length( p.xz );\n' +
    '  return dot( c, vec2( q, p.y ) );\n' +
    '}\n' );

  // n normalized
  snippets.sdPlane = new tess.Snippet(
    'float sdPlane( vec3 p, vec3 n, float d ) {\n' +
    '  return dot( p, n ) + d;\n' +
    '}\n' );

  snippets.sdHexPrism = new tess.Snippet(
    'float sdHexPrism( vec3 p, vec2 h ) {\n' +
    '  vec3 q = abs( p );\n' +
    '  return max( q.z - h.y, max( q.x + q.y * 0.57735, q.y * 1.1547 ) - h.x );\n' +
    '}\n' );

  snippets.sdTriPrism = new tess.Snippet(
    'float sdTriPrism( vec3 p, vec2 h ) {\n' +
    '  vec3 q = abs( p );\n' +
    '  return max( q.z - h.y, max( q.x * 0.866025 + p.y * 0.5, -p.y ) - h.x * 0.5 );\n' +
    '}\n' );

  snippets.sdCapsule = new tess.Snippet(
    'float sdCapsule( vec3 p, vec3 a, vec3 b, float r ) {\n' +
    '  vec3 pa = p - a, ba = b - a;\n' +
    '  float h = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 );\n' +
    '  return length(  pa - ba * h ) - r;\n' +
    '}\n' );

  snippets.sdCappedCylinder = new tess.Snippet(
    'float sdCappedCylinder( vec3 p, vec2 h ) {\n' +
    '  vec2 d = abs( vec2( length( p.xz ), p.y ) ) - h;\n' +
    '  return min( max( d.x, d.y ), 0.0 ) + length( max( d, 0.0 ) );\n' +
    '}\n' );

  snippets.dUnion = new tess.Snippet(
    'float dUnion( float d1, float d2 ) {\n' +
    '  return min( d1, d2) ;\n' +
    '}\n' );

  snippets.dDifference = new tess.Snippet(
    'float dDifference( float d1, float d2 ) {\n' +
    '  return max( d1, -d2) ;\n' +
    '}\n' );

  snippets.dIntersection = new tess.Snippet(
    'float dIntersection( float d1, float d2 ) {\n' +
    '  return max( d1, d2) ;\n' +
    '}\n' );

  snippets.sMinExp = new tess.Snippet(
    'float sMinExp( float a, float b, float k ) {\n' +
    '  float res = exp( -k*a ) + exp( -k*b );\n' +
    '  return -log( res )/k;\n' +
    '}\n' );

  snippets.sMaxExp = new tess.Snippet(
    'float sMaxExp( float a, float b, float k ) {\n' +
    '  float res = exp( k*a ) + exp( k*b );\n' +
    '  return log( res )/k;\n' +
    '}\n' );

  // tested so far with steps: 65, stepRatio: 1.0, endThreshold: 0.1, requiredSnippets: [theDistanceFunction]
  tess.createDistanceFieldMarcher = function( marcherName, fieldName, steps, stepRatio, endThreshold, requiredSnippets ) {
    return new tess.Snippet(
      'float ' + marcherName + '( vec3 rayPos, vec3 rayDir ) {\n' +
      '  float t = 0.0;\n' +
      '  float dt = 0.0;\n' +
      '  for( int tests = 0; tests < ' + steps + '; tests++ ) {\n' +
      '    vec3 p = rayT( rayPos, rayDir, t );\n' +
      '    float dist = ' + fieldName + '( p );\n' +
      '    dt = dist * ' + tess.toFloat( stepRatio ) + ';\n' +
      '    t = t + dt;\n' +
      '  }\n' +
      '  return dt > ' + tess.toFloat( endThreshold ) + ' ? -1.0 : t;\n' +
      '}\n',
      [tess.snippets.rayT].concat( requiredSnippets )
    );
  };

  // tested so far with offsetDistance: 0.001, gradientDistance: 0.0001
  tess.createDistanceFieldNormal = function( normalName, fieldName, offsetDistance, gradientDistance, requiredSnippets ) {
    return new tess.Snippet(
      'vec3 ' + normalName + '( vec3 rayPos, vec3 rayDir, vec3 hitPos ) {\n' +
      '  vec3 testPoint = hitPos - rayDir * 0.001;\n' +
      // central difference approximation of the gradient (normalized)
      '  return normalize( vec3( ' +
          fieldName + '( testPoint + vec3( ' + tess.toFloat( gradientDistance ) + ', 0.0, 0.0 ) ) - ' + fieldName + '( testPoint - vec3( ' + tess.toFloat( gradientDistance ) + ', 0.0, 0.0 ) ),' +
          fieldName + '( testPoint + vec3( 0.0, ' + tess.toFloat( gradientDistance ) + ', 0.0 ) ) - ' + fieldName + '( testPoint - vec3( 0.0, ' + tess.toFloat( gradientDistance ) + ', 0.0 ) ),' +
          fieldName + '( testPoint + vec3( 0.0, 0.0, ' + tess.toFloat( gradientDistance ) + ' ) ) - ' + fieldName + '( testPoint - vec3( 0.0, 0.0, ' + tess.toFloat( gradientDistance ) + ' ) )' +
      ' ) );\n' +
      '}\n',
      requiredSnippets
    );
  };

})();
