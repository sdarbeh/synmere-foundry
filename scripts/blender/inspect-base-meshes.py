import bpy
import sys


def describe_object(item: bpy.types.Object) -> str:
    if item.type != "MESH":
        return f"{item.name} | {item.type}"

    mesh = item.data
    asset = mesh.asset_data is not None or item.asset_data is not None
    return (
        f"{item.name} | MESH | vertices={len(mesh.vertices)} "
        f"polygons={len(mesh.polygons)} asset={asset}"
    )


if len(sys.argv) > 1:
    bpy.ops.wm.open_mainfile(filepath=sys.argv[-1])

print("SYNMERE_OBJECTS")
for object_item in sorted(bpy.data.objects, key=lambda item: item.name):
    print(describe_object(object_item))

print("SYNMERE_COLLECTIONS")
for collection in sorted(bpy.data.collections, key=lambda item: item.name):
    print(f"{collection.name} | objects={len(collection.objects)}")
