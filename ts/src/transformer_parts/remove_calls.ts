import {RemoveCallsTaskDef} from "transformer_config"
import * as Tsc from "typescript"
import {typeHasMarker} from "tsc_tricks"
import {SubTransformer, SubTransformerTransformParams} from "main_transformer"

export class RemoveCallsTransformer implements SubTransformer {

	toString(): string {
		return "RemoveCalls"
	}

	constructor(private readonly tasks: RemoveCallsTaskDef[]) {}

	transform(params: SubTransformerTransformParams): Tsc.SourceFile {

		let visitor = (node: Tsc.Node): Tsc.VisitResult<Tsc.Node> => {
			if(Tsc.isCallExpression(node)){
				let type = params.typechecker.getTypeAtLocation(node)
				for(let i = 0; i < this.tasks.length; i++){
					let task = this.tasks[i]
					if(typeHasMarker(Tsc, params.typechecker, type, task.markerName)){
						return Tsc.factory.createVoidZero()
					}
				}
			}

			if(Tsc.isInterfaceDeclaration(node)){
				// we should never alter interface declaration, as it will break declarations of marker interfaces
				// also there is no values inside interface declarations, so no point in looking deeper
				return node
			}

			return Tsc.visitEachChild(node, visitor, params.transformContext)
		}

		return Tsc.visitEachChild(params.file, visitor, params.transformContext)
	}

	onModuleDelete(): void {
		// nothing. this transformer don't care.
	}


}